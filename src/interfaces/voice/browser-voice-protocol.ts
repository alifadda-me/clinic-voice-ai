/**
 * JSON protocol for browser ↔ server voice test WebSocket.
 * Provider-neutral — no Gemini or WebSocket SDK types.
 */

export type BrowserVoiceClientMessage =
  | {
      type: 'start';
      conversationId?: string | undefined;
      /** Raw Bearer token value (optional). */
      authorization?: string | undefined;
    }
  | {
      type: 'audio';
      dataBase64: string;
      mimeType: string;
    }
  | { type: 'stop' };

export type BrowserVoiceServerMessage =
  | {
      type: 'ready';
      conversationId: string;
      authenticated: boolean;
    }
  | {
      type: 'audio';
      dataBase64: string;
      mimeType: string;
    }
  | {
      type: 'transcript';
      role: 'user' | 'assistant';
      text: string;
    }
  | {
      type: 'tool';
      name: string;
      ok: boolean;
    }
  | {
      type: 'error';
      code: string;
      message: string;
    }
  | { type: 'closed' }
  | { type: 'interrupt' };

export const BROWSER_VOICE_WS_PATH = '/v1/voice/browser';

export function parseBrowserVoiceClientMessage(
  raw: string,
): BrowserVoiceClientMessage | null {
  try {
    const data = JSON.parse(raw) as BrowserVoiceClientMessage;
    if (!data || typeof data !== 'object' || !('type' in data)) return null;
    return data;
  } catch {
    return null;
  }
}

export function serializeBrowserVoiceServerMessage(
  message: BrowserVoiceServerMessage,
): string {
  return JSON.stringify(message);
}
