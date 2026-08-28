import type { ChatModel, ChatResponse } from '../../src/ports/platform/chat-model.js';

/** Queued ChatModel responses for deterministic agent tests. */
export class ScriptedChatModel implements ChatModel {
  private readonly queue: ChatResponse[] = [];

  enqueue(...responses: ChatResponse[]): void {
    this.queue.push(...responses);
  }

  async generate(_request: Parameters<ChatModel['generate']>[0]): Promise<ChatResponse> {
    const next = this.queue.shift();
    if (!next) return { content: 'No further scripted responses.' };
    return next;
  }
}
