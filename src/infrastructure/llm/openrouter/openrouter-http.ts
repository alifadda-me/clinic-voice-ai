/**
 * OpenRouter ChatModel adapter — maps provider-neutral ChatModel ↔ OpenAI-compatible HTTP.
 * No openai npm package: injectable fetch client keeps unit tests credential-free.
 */

export type OpenRouterHttpRequest = {
  url: string;
  headers: Record<string, string>;
  body: unknown;
  timeoutMs: number;
};

export type OpenRouterHttpResponse = {
  status: number;
  bodyText: string;
};

export type OpenRouterHttpClient = {
  postJson(request: OpenRouterHttpRequest): Promise<OpenRouterHttpResponse>;
};

export function createFetchOpenRouterHttpClient(
  fetchImpl: typeof fetch = fetch,
): OpenRouterHttpClient {
  return {
    async postJson(request) {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), request.timeoutMs);
      try {
        const response = await fetchImpl(request.url, {
          method: 'POST',
          headers: request.headers,
          body: JSON.stringify(request.body),
          signal: controller.signal,
        });
        const bodyText = await response.text();
        return { status: response.status, bodyText };
      } finally {
        clearTimeout(timer);
      }
    },
  };
}
