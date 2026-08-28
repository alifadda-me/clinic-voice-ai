/**
 * Minimal Gemini Live transport surface — real SDK or fakes implement this.
 * Keeps @google/genai types out of the LiveVoiceProvider adapter tests.
 */

export type GeminiLiveTransportMessage = {
  /** Opaque provider payload; adapter maps to handlers. */
  kind: 'audio' | 'transcript' | 'toolCall' | 'error' | 'close';
  audioBase64?: string;
  mimeType?: string;
  transcript?: string;
  transcriptRole?: 'user' | 'assistant';
  toolCall?: {
    id: string;
    name: string;
    arguments: Record<string, unknown>;
  };
  error?: Error;
};

export type GeminiLiveTransportSession = {
  sendAudio(dataBase64: string, mimeType: string): Promise<void>;
  sendText(text: string): Promise<void>;
  close(): Promise<void>;
};

export type GeminiLiveTransport = {
  connect(params: {
    systemInstruction: string;
    tools: ReadonlyArray<{
      name: string;
      description: string;
      parametersSchema: Record<string, unknown>;
    }>;
    onMessage: (message: GeminiLiveTransportMessage) => void | Promise<void>;
  }): Promise<GeminiLiveTransportSession>;
};
