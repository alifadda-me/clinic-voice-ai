/**
 * Browser mic/speaker client for /v1/voice/browser WebSocket.
 * Keeps audio logic out of app.js.
 */

const INPUT_SAMPLE_RATE = 16000;
const OUTPUT_SAMPLE_RATE = 24000;
/** Hold mic after assistant audio so speaker bleed does not loop back. */
const MIC_UNMUTE_TAIL_SEC = 0.2;

/** @typedef {'idle' | 'connecting' | 'live' | 'error'} BrowserVoiceState */

/**
 * @param {object} options
 * @param {() => string} options.resolveWsUrl
 * @param {() => string} options.getConversationId
 * @param {() => string} options.getJwt
 * @param {() => boolean} options.useJwt
 * @param {(state: BrowserVoiceState, detail?: string) => void} options.onState
 * @param {(role: string, text: string) => void} options.onTranscript
 * @param {(name: string, ok: boolean) => void} [options.onTool]
 * @param {(entry: object) => void} [options.onLog]
 */
export function createBrowserVoiceClient(options) {
  /** @type {WebSocket | null} */
  let ws = null;
  /** @type {MediaStream | null} */
  let micStream = null;
  /** @type {AudioContext | null} */
  let audioContext = null;
  /** @type {ScriptProcessorNode | null} */
  let processor = null;
  /** @type {number} */
  let playbackTime = 0;
  /** @type {number} */
  let micMutedUntil = 0;
  /** @type {Set<AudioBufferSourceNode>} */
  const activePlaybackSources = new Set();
  /** @type {boolean} */
  let streaming = false;

  function setState(state, detail = '') {
    options.onState(state, detail);
  }

  function log(entry) {
    options.onLog?.(entry);
  }

  function isMicGated() {
    return Boolean(audioContext && audioContext.currentTime < micMutedUntil);
  }

  function flushPlayback() {
    for (const source of activePlaybackSources) {
      try {
        source.stop();
      } catch {
        /* already stopped */
      }
    }
    activePlaybackSources.clear();
    if (audioContext) {
      playbackTime = audioContext.currentTime;
      micMutedUntil = audioContext.currentTime;
    } else {
      playbackTime = 0;
      micMutedUntil = 0;
    }
  }

  async function start() {
    if (ws) return;

    if (!navigator.mediaDevices?.getUserMedia) {
      setState('error', 'Microphone not supported in this browser');
      return;
    }

    setState('connecting');

    const url = options.resolveWsUrl();
    ws = new WebSocket(url);

    ws.onopen = async () => {
      try {
        log({ event: 'voice_ws_open', url });

        const payload = {
          type: 'start',
          conversationId: options.getConversationId() || undefined,
        };
        const jwt = options.useJwt() ? options.getJwt().trim() : '';
        if (jwt) payload.authorization = jwt;
        ws.send(JSON.stringify(payload));

        micStream = await navigator.mediaDevices.getUserMedia({
          audio: {
            echoCancellation: true,
            noiseSuppression: true,
            autoGainControl: false,
          },
        });

        // One context for capture + playback so browser echo cancellation works.
        audioContext = new AudioContext();
        await audioContext.resume();
        playbackTime = audioContext.currentTime;
        micMutedUntil = audioContext.currentTime;

        const source = audioContext.createMediaStreamSource(micStream);
        processor = audioContext.createScriptProcessor(4096, 1, 1);
        const silent = audioContext.createGain();
        silent.gain.value = 0;

        processor.onaudioprocess = (event) => {
          if (!streaming || !ws || ws.readyState !== WebSocket.OPEN) return;
          if (isMicGated()) return;

          const input = event.inputBuffer.getChannelData(0);
          const pcm = downsampleToPcm16(
            input,
            audioContext.sampleRate,
            INPUT_SAMPLE_RATE,
          );
          if (pcm.byteLength === 0) return;
          ws.send(
            JSON.stringify({
              type: 'audio',
              dataBase64: arrayBufferToBase64(pcm),
              mimeType: `audio/pcm;rate=${INPUT_SAMPLE_RATE}`,
            }),
          );
        };

        source.connect(processor);
        processor.connect(silent);
        silent.connect(audioContext.destination);
      } catch (error) {
        const message =
          error instanceof Error ? error.message : 'Microphone access failed';
        setState('error', message);
        await stop();
      }
    };

    ws.onmessage = (event) => {
      let data;
      try {
        data = JSON.parse(String(event.data));
      } catch {
        return;
      }

      switch (data.type) {
        case 'ready':
          streaming = true;
          void audioContext?.resume();
          setState('live', data.conversationId);
          log({
            event: 'voice_ready',
            conversationId: data.conversationId,
            authenticated: data.authenticated,
          });
          break;
        case 'audio':
          schedulePlayback(data.dataBase64, parseSampleRate(data.mimeType));
          break;
        case 'interrupt':
          flushPlayback();
          break;
        case 'transcript':
          options.onTranscript(data.role, data.text);
          break;
        case 'tool':
          options.onTool?.(data.name, data.ok);
          log({ event: 'voice_tool', name: data.name, ok: data.ok });
          break;
        case 'error':
          setState('error', data.message || data.code);
          log({ event: 'voice_error', code: data.code, message: data.message });
          break;
        case 'closed':
          setState('idle');
          break;
        default:
          break;
      }
    };

    ws.onerror = () => {
      setState('error', 'WebSocket error — is ENABLE_VOICE=true?');
    };

    ws.onclose = () => {
      cleanupMedia();
      ws = null;
      setState('idle');
    };
  }

  async function stop() {
    streaming = false;
    if (ws && ws.readyState === WebSocket.OPEN) {
      try {
        ws.send(JSON.stringify({ type: 'stop' }));
      } catch {
        /* ignore */
      }
      ws.close();
    }
    ws = null;
    cleanupMedia();
    setState('idle');
  }

  function cleanupMedia() {
    streaming = false;
    flushPlayback();
    processor?.disconnect();
    processor = null;
    micStream?.getTracks().forEach((t) => t.stop());
    micStream = null;
    void audioContext?.close();
    audioContext = null;
    playbackTime = 0;
    micMutedUntil = 0;
  }

  function schedulePlayback(dataBase64, sampleRate) {
    if (!audioContext) return;
    const bytes = base64ToArrayBuffer(dataBase64);
    const int16 = new Int16Array(bytes);
    if (int16.length === 0) return;

    const float32 = new Float32Array(int16.length);
    for (let i = 0; i < int16.length; i++) {
      float32[i] = int16[i] / 32768;
    }

    const buffer = audioContext.createBuffer(1, float32.length, sampleRate);
    buffer.copyToChannel(float32, 0);

    const source = audioContext.createBufferSource();
    source.buffer = buffer;
    source.connect(audioContext.destination);

    const startAt = Math.max(audioContext.currentTime, playbackTime);
    source.start(startAt);
    const endAt = startAt + buffer.duration;
    playbackTime = endAt;
    micMutedUntil = endAt + MIC_UNMUTE_TAIL_SEC;

    activePlaybackSources.add(source);
    source.onended = () => {
      activePlaybackSources.delete(source);
    };
  }

  return { start, stop };
}

export function resolveBrowserVoiceWsUrl(baseOrigin) {
  const base = baseOrigin.replace(/\/$/, '');
  const wsBase = base.replace(/^http:/i, 'ws:').replace(/^https:/i, 'wss:');
  return `${wsBase}/v1/voice/browser`;
}

function downsampleToPcm16(float32, fromRate, toRate) {
  if (fromRate === toRate) {
    return floatTo16BitPcm(float32);
  }
  const ratio = fromRate / toRate;
  const outLength = Math.floor(float32.length / ratio);
  const out = new Int16Array(outLength);
  for (let i = 0; i < outLength; i++) {
    const idx = Math.floor(i * ratio);
    const s = Math.max(-1, Math.min(1, float32[idx] ?? 0));
    out[i] = s < 0 ? s * 32768 : s * 32767;
  }
  return out.buffer;
}

function floatTo16BitPcm(float32) {
  const out = new Int16Array(float32.length);
  for (let i = 0; i < float32.length; i++) {
    const s = Math.max(-1, Math.min(1, float32[i] ?? 0));
    out[i] = s < 0 ? s * 32768 : s * 32767;
  }
  return out.buffer;
}

function arrayBufferToBase64(buffer) {
  const bytes = new Uint8Array(buffer);
  let binary = '';
  for (let i = 0; i < bytes.length; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return btoa(binary);
}

function base64ToArrayBuffer(base64) {
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes.buffer;
}

function parseSampleRate(mimeType) {
  const match = /rate=(\d+)/i.exec(mimeType ?? '');
  return match ? Number(match[1]) : OUTPUT_SAMPLE_RATE;
}
