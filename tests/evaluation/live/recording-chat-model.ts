import type {
  ChatModel,
  ChatRequest,
  ChatResponse,
} from '../../../src/ports/platform/chat-model.js';
import { accumulateUsage } from './metrics.js';

/**
 * Metrics wrapper around any ChatModel — does not change behavior.
 */
export class RecordingChatModel implements ChatModel {
  modelCallCount = 0;
  readonly tokens = { prompt: 0, completion: 0, total: 0 };
  lastError: unknown;

  constructor(private readonly inner: ChatModel) {}

  async generate(request: ChatRequest): Promise<ChatResponse> {
    this.modelCallCount += 1;
    try {
      const response = await this.inner.generate(request);
      accumulateUsage(this.tokens, response.usage);
      return response;
    } catch (error) {
      this.lastError = error;
      throw error;
    }
  }

  reset(): void {
    this.modelCallCount = 0;
    this.tokens.prompt = 0;
    this.tokens.completion = 0;
    this.tokens.total = 0;
    this.lastError = undefined;
  }
}
