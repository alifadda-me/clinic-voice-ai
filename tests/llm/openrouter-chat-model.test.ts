import { describe, expect, it } from 'vitest';
import { OpenRouterChatModel } from '../../src/infrastructure/llm/openrouter/openrouter-chat-model.js';
import type {
  OpenRouterHttpClient,
  OpenRouterHttpRequest,
  OpenRouterHttpResponse,
} from '../../src/infrastructure/llm/openrouter/openrouter-http.js';
import {
  ChatModelInvalidResponseError,
  ChatModelUnavailableError,
} from '../../src/ports/platform/chat-model.js';
import type { OpenRouterChatConfig } from '../../src/config/openrouter.js';

const config: OpenRouterChatConfig = {
  apiKey: 'test-key',
  model: 'openai/gpt-4o-mini',
  baseUrl: 'https://openrouter.ai/api/v1',
  timeoutMs: 5_000,
};

function fakeClient(
  handler: (req: OpenRouterHttpRequest) => Promise<OpenRouterHttpResponse>,
): OpenRouterHttpClient {
  return { postJson: handler };
}

describe('OpenRouterChatModel', () => {
  it('maps request messages, system instruction, and tools', async () => {
    let captured: OpenRouterHttpRequest | undefined;
    const http = fakeClient(async (req) => {
      captured = req;
      return {
        status: 200,
        bodyText: JSON.stringify({
          choices: [{ message: { content: 'Hello' } }],
        }),
      };
    });

    const model = new OpenRouterChatModel(http, config);
    const response = await model.generate({
      systemInstruction: 'Be brief',
      messages: [{ role: 'user', content: 'Hi' }],
      tools: [
        {
          name: 'search_doctors',
          description: 'Find doctors',
          parameters: { type: 'object', properties: { query: { type: 'string' } } },
        },
      ],
    });

    expect(response.content).toBe('Hello');
    expect(captured?.url).toBe('https://openrouter.ai/api/v1/chat/completions');
    expect(captured?.headers.Authorization).toBe('Bearer test-key');
    const body = captured!.body as {
      model: string;
      messages: Array<{ role: string; content: string }>;
      tools: Array<{ type: string; function: { name: string } }>;
    };
    expect(body.model).toBe('openai/gpt-4o-mini');
    expect(body.messages[0]).toEqual({ role: 'system', content: 'Be brief' });
    expect(body.messages[1]).toEqual({ role: 'user', content: 'Hi' });
    expect(body.tools[0]?.function.name).toBe('search_doctors');
  });

  it('maps tool_calls including JSON arguments', async () => {
    const http = fakeClient(async () => ({
      status: 200,
      bodyText: JSON.stringify({
        choices: [
          {
            message: {
              content: null,
              tool_calls: [
                {
                  id: 'call_1',
                  type: 'function',
                  function: {
                    name: 'book_appointment',
                    arguments: '{"doctorId":"doc_1","start":"2026-08-25T10:00:00.000Z","end":"2026-08-25T10:30:00.000Z"}',
                  },
                },
              ],
            },
          },
        ],
      }),
    }));

    const model = new OpenRouterChatModel(http, config);
    const response = await model.generate({
      messages: [{ role: 'user', content: 'book' }],
    });

    expect(response.toolCalls).toEqual([
      {
        id: 'call_1',
        name: 'book_appointment',
        arguments: {
          doctorId: 'doc_1',
          start: '2026-08-25T10:00:00.000Z',
          end: '2026-08-25T10:30:00.000Z',
        },
      },
    ]);
  });

  it('maps assistant toolCalls back into OpenRouter format', async () => {
    let captured: OpenRouterHttpRequest | undefined;
    const http = fakeClient(async (req) => {
      captured = req;
      return {
        status: 200,
        bodyText: JSON.stringify({
          choices: [{ message: { content: 'done' } }],
        }),
      };
    });

    const model = new OpenRouterChatModel(http, config);
    await model.generate({
      messages: [
        {
          role: 'assistant',
          content: '',
          toolCalls: [
            {
              id: 'c1',
              name: 'search_specialties',
              arguments: { query: 'skin' },
            },
          ],
        },
        {
          role: 'tool',
          toolCallId: 'c1',
          name: 'search_specialties',
          content: '{"ok":true}',
        },
      ],
    });

    const messages = (captured!.body as { messages: unknown[] }).messages;
    expect(messages[0]).toMatchObject({
      role: 'assistant',
      tool_calls: [
        {
          id: 'c1',
          type: 'function',
          function: {
            name: 'search_specialties',
            arguments: '{"query":"skin"}',
          },
        },
      ],
    });
    expect(messages[1]).toMatchObject({
      role: 'tool',
      tool_call_id: 'c1',
      content: '{"ok":true}',
    });
  });

  it('throws ChatModelUnavailableError on HTTP 503', async () => {
    const http = fakeClient(async () => ({
      status: 503,
      bodyText: 'unavailable',
    }));
    const model = new OpenRouterChatModel(http, config);
    await expect(
      model.generate({ messages: [{ role: 'user', content: 'hi' }] }),
    ).rejects.toBeInstanceOf(ChatModelUnavailableError);
  });

  it('maps optional token usage when present', async () => {
    const http = fakeClient(async () => ({
      status: 200,
      bodyText: JSON.stringify({
        choices: [{ message: { content: 'Hello' } }],
        usage: {
          prompt_tokens: 12,
          completion_tokens: 4,
          total_tokens: 16,
        },
      }),
    }));
    const model = new OpenRouterChatModel(http, config);
    const response = await model.generate({
      messages: [{ role: 'user', content: 'hi' }],
    });
    expect(response.usage).toEqual({
      promptTokens: 12,
      completionTokens: 4,
      totalTokens: 16,
    });
  });

  it('throws ChatModelUnavailableError on network failure', async () => {
    const http = fakeClient(async () => {
      throw new Error('connect ETIMEDOUT');
    });
    const model = new OpenRouterChatModel(http, config);
    await expect(
      model.generate({ messages: [{ role: 'user', content: 'hi' }] }),
    ).rejects.toBeInstanceOf(ChatModelUnavailableError);
  });

  it('throws ChatModelInvalidResponseError on malformed JSON', async () => {
    const http = fakeClient(async () => ({
      status: 200,
      bodyText: '{not-json',
    }));
    const model = new OpenRouterChatModel(http, config);
    await expect(
      model.generate({ messages: [{ role: 'user', content: 'hi' }] }),
    ).rejects.toBeInstanceOf(ChatModelInvalidResponseError);
  });

  it('throws ChatModelInvalidResponseError on invalid tool arguments JSON', async () => {
    const http = fakeClient(async () => ({
      status: 200,
      bodyText: JSON.stringify({
        choices: [
          {
            message: {
              tool_calls: [
                {
                  id: '1',
                  function: { name: 'search_doctors', arguments: 'not-json' },
                },
              ],
            },
          },
        ],
      }),
    }));
    const model = new OpenRouterChatModel(http, config);
    await expect(
      model.generate({ messages: [{ role: 'user', content: 'hi' }] }),
    ).rejects.toBeInstanceOf(ChatModelInvalidResponseError);
  });
});
