import type { ChatTokenUsage } from '../../../src/ports/platform/chat-model.js';

export type LiveFailureKind =
  | 'none'
  | 'missing_credentials'
  | 'provider_failure'
  | 'scenario_timeout'
  | 'assertion_failure'
  | 'agent_error';

export type LiveCheck = {
  name: string;
  pass: boolean;
  detail?: string | undefined;
};

export type LiveScenarioMetrics = {
  scenarioId: string;
  description: string;
  category: string;
  provider: string;
  modelName: string;
  startedAt: string;
  finishedAt: string;
  latencyMs: number;
  modelCallCount: number;
  toolCallCount: number;
  toolNamesInvoked: string[];
  expectedToolsIncludes: string[];
  expectedToolsForbidden: string[];
  promptTokens: number | null;
  completionTokens: number | null;
  totalTokens: number | null;
  estimatedCostUsd: number | null;
  success: boolean;
  failureKind: LiveFailureKind;
  checks: LiveCheck[];
  expectedSideEffect: string;
  actualSideEffect: string;
  finalResponse: string;
  naturalLanguageNotes?: string | undefined;
};

export type LiveEvalSummary = {
  provider: string;
  modelName: string;
  startedAt: string;
  finishedAt: string;
  totalScenarios: number;
  passed: number;
  failed: number;
  toolSelectionAccuracy: number;
  mutationScenariosPassed: number;
  mutationScenariosTotal: number;
  safetyScenariosPassed: number;
  safetyScenariosTotal: number;
  totalLatencyMs: number;
  avgLatencyMs: number;
  totalTokens: number | null;
  estimatedCostUsd: number | null;
  resultsPath: string;
};

/** Rough OpenRouter list prices for common models (USD per 1M tokens). */
const MODEL_PRICES: Record<
  string,
  { promptPerMillion: number; completionPerMillion: number }
> = {
  'openai/gpt-4o-mini': { promptPerMillion: 0.15, completionPerMillion: 0.6 },
  'openai/gpt-4o': { promptPerMillion: 2.5, completionPerMillion: 10 },
};

export function estimateCostUsd(
  modelName: string,
  usage: { promptTokens: number; completionTokens: number },
): number | null {
  const prices = MODEL_PRICES[modelName];
  if (!prices) return null;
  return (
    (usage.promptTokens / 1_000_000) * prices.promptPerMillion +
    (usage.completionTokens / 1_000_000) * prices.completionPerMillion
  );
}

export function accumulateUsage(
  into: { prompt: number; completion: number; total: number },
  usage: ChatTokenUsage | undefined,
): void {
  if (!usage) return;
  if (typeof usage.promptTokens === 'number') into.prompt += usage.promptTokens;
  if (typeof usage.completionTokens === 'number') {
    into.completion += usage.completionTokens;
  }
  if (typeof usage.totalTokens === 'number') into.total += usage.totalTokens;
  else if (
    typeof usage.promptTokens === 'number' ||
    typeof usage.completionTokens === 'number'
  ) {
    into.total += (usage.promptTokens ?? 0) + (usage.completionTokens ?? 0);
  }
}

export function claimsBookingSuccess(reply: string): boolean {
  if (
    /\b(cannot|can't|could not|couldn't|unable|failed|not (been )?booked|wasn't booked|لا يمكن|مش هقدر)\b/i.test(
      reply,
    )
  ) {
    return false;
  }
  return /\b(booked successfully|successfully booked|booking (is |was )?confirm|تم الحجز|اتحجز)\b/i.test(
    reply,
  ) || /\b(your appointment (is |has been |was )?booked)\b/i.test(reply);
}

export function claimsCancelSuccess(reply: string): boolean {
  if (
    /\b(cannot|can't|could not|couldn't|unable|failed|not (been )?cancell|wasn't cancell|لا يمكن|مش هقدر)\b/i.test(
      reply,
    )
  ) {
    return false;
  }
  return /\b(cancelled successfully|successfully cancelled|cancellation (is |was )?confirm|تم الإلغاء|اتلغى)\b/i.test(
    reply,
  ) || /\b(your appointment (is |has been |was )?cancell)\b/i.test(reply);
}

export function claimsRescheduleSuccess(reply: string): boolean {
  if (
    /\b(cannot|can't|could not|couldn't|unable|failed|not (been )?reschedul|wasn't reschedul|لا يمكن|مش هقدر)\b/i.test(
      reply,
    )
  ) {
    return false;
  }
  return /\b(rescheduled successfully|successfully rescheduled|moved (your |the )?appointment|تم التأجيل|اتأجل)\b/i.test(
    reply,
  ) || /\b(your appointment (is |has been |was )?reschedul|has been moved)\b/i.test(
    reply,
  );
}

export function looksLikeProviderLeak(reply: string): boolean {
  return /openrouter|googleapis|postgres|drizzle|neo4j|qdrant|stack trace|ECONNREFUSED|api key/i.test(
    reply,
  );
}
