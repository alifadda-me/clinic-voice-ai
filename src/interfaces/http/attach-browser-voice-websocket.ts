import type { Server } from 'node:http';
import { randomUUID } from 'node:crypto';
import { WebSocketServer, type WebSocket } from 'ws';
import type { ObservabilityPort } from '../../ports/platform/observability.js';
import { BrowserVoiceCallBridge } from '../voice/browser-voice-call-bridge.js';
import {
  BROWSER_VOICE_WS_PATH,
  parseBrowserVoiceClientMessage,
  serializeBrowserVoiceServerMessage,
} from '../voice/browser-voice-protocol.js';
import type { VoiceClinicSession } from '../voice/voice-clinic-session.js';

export type AttachBrowserVoiceWebSocketDeps = {
  voiceClinicSession: VoiceClinicSession;
  observability?: ObservabilityPort | undefined;
};

/**
 * Upgrades GET /v1/voice/browser to a JSON voice test WebSocket.
 * Requires ENABLE_VOICE + GEMINI_API_KEY (VoiceClinicSession on server).
 */
export function attachBrowserVoiceWebSocket(
  server: Server,
  deps: AttachBrowserVoiceWebSocketDeps,
): { close: () => void } {
  const bridge = new BrowserVoiceCallBridge({
    voiceClinicSession: deps.voiceClinicSession,
    ...(deps.observability ? { observability: deps.observability } : {}),
  });

  const wss = new WebSocketServer({ noServer: true });

  const onUpgrade = (
    request: { url?: string | undefined; headers: { host?: string | undefined } },
    socket: { destroy(): void },
    head: Buffer,
  ) => {
    const host = request.headers.host ?? 'localhost';
    const pathname = new URL(request.url ?? '/', `http://${host}`).pathname;
    if (pathname !== BROWSER_VOICE_WS_PATH) {
      return;
    }

    wss.handleUpgrade(
      request as import('node:http').IncomingMessage,
      socket as import('node:net').Socket,
      head,
      (ws) => {
        wss.emit('connection', ws, request);
      },
    );
  };

  server.on('upgrade', onUpgrade);

  wss.on('connection', (ws: WebSocket) => {
    const connectionId = randomUUID();

    const send = (message: Parameters<typeof serializeBrowserVoiceServerMessage>[0]) => {
      if (ws.readyState === ws.OPEN) {
        ws.send(serializeBrowserVoiceServerMessage(message));
      }
    };

    ws.on('message', (data) => {
      const raw = typeof data === 'string' ? data : data.toString('utf8');
      const parsed = parseBrowserVoiceClientMessage(raw);
      if (!parsed) {
        send({
          type: 'error',
          code: 'INVALID_MESSAGE',
          message: 'Expected JSON voice protocol message',
        });
        return;
      }
      void bridge.handleMessage(connectionId, parsed, send);
    });

    ws.on('close', () => {
      void bridge.stopSession(connectionId);
    });

    ws.on('error', () => {
      void bridge.stopSession(connectionId);
    });
  });

  return {
    close: () => {
      server.off('upgrade', onUpgrade);
      wss.close();
    },
  };
}
