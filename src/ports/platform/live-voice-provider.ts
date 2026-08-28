/**
 * Platform live voice — transport-agnostic realtime session contract.
 * No Gemini Live / Twilio types.
 */

export type VoiceSessionId = string;

export type VoiceAudioChunk = {
  /** PCM or opaque encoded audio bytes as base64. */
  dataBase64: string;
  mimeType: string;
};

export type VoiceToolCall = {
  id: string;
  name: string;
  arguments: Record<string, unknown>;
};

export type VoiceSessionHandlers = {
  onAudio?: (chunk: VoiceAudioChunk) => void;
  onTranscript?: (text: string, role: 'user' | 'assistant') => void;
  onToolCall?: (call: VoiceToolCall) => Promise<string>;
  onError?: (error: Error) => void;
  onClose?: () => void;
};

export type StartVoiceSessionParams = {
  sessionId: VoiceSessionId;
  systemInstruction: string;
  tools?: ReadonlyArray<{
    name: string;
    description: string;
    parametersSchema: Record<string, unknown>;
  }>;
  handlers: VoiceSessionHandlers;
};

export interface LiveVoiceSession {
  sendAudio(chunk: VoiceAudioChunk): Promise<void>;
  sendText(text: string): Promise<void>;
  close(): Promise<void>;
}

export interface LiveVoiceProvider {
  startSession(params: StartVoiceSessionParams): Promise<LiveVoiceSession>;
}

export class LiveVoiceUnavailableError extends Error {
  readonly code = 'LIVE_VOICE_UNAVAILABLE';

  constructor(message = 'Live voice is temporarily unavailable') {
    super(message);
    this.name = 'LiveVoiceUnavailableError';
  }
}
