/**
 * Live OpenRouter evaluation — OPT-IN ONLY.
 *
 * Run: npm run eval:live
 * Requires: OPENROUTER_API_KEY (no silent fake fallback)
 *
 * Assumption: Demo bootstrap identity is trusted only in controlled evaluation
 * and is NOT production authentication.
 *
 * Never included in `npm test`.
 */

import { config as loadDotenv } from 'dotenv';
import { describe, expect, it } from 'vitest';
import { createOpenRouterChatModel } from '../../../src/infrastructure/llm/openrouter/create-openrouter-chat-model.js';
import { runLiveEvaluation } from './runner.js';
import { LIVE_SCENARIOS } from './scenarios.js';

loadDotenv();

function requireOpenRouterApiKey(): string {
  const key = process.env.OPENROUTER_API_KEY?.trim();
  if (!key) {
    throw new Error(
      'OPENROUTER_API_KEY is required for npm run eval:live. ' +
        'Refusing to fall back to a fake/scripted model. ' +
        'Set the key in .env or the environment, then re-run.',
    );
  }
  return key;
}

describe('Live OpenRouter evaluation', () => {
  it('fails clearly when OPENROUTER_API_KEY is missing', () => {
    const previous = process.env.OPENROUTER_API_KEY;
    delete process.env.OPENROUTER_API_KEY;
    try {
      expect(() => requireOpenRouterApiKey()).toThrow(/OPENROUTER_API_KEY is required/);
    } finally {
      if (previous === undefined) delete process.env.OPENROUTER_API_KEY;
      else process.env.OPENROUTER_API_KEY = previous;
    }
  });

  it(
    'runs the live scenario suite against OpenRouter and persists metrics',
    async () => {
      requireOpenRouterApiKey();

      // Longer provider timeout for multi-step tool loops.
      if (!process.env.OPENROUTER_TIMEOUT_MS) {
        process.env.OPENROUTER_TIMEOUT_MS = '60000';
      }

      const modelName =
        process.env.OPENROUTER_MODEL?.trim() || 'openai/gpt-4o-mini';
      const chatModel = createOpenRouterChatModel(process.env);

      const { summary, results, resultsPath, summaryPath } =
        await runLiveEvaluation({
          chatModel,
          provider: 'openrouter',
          modelName,
          scenarios: LIVE_SCENARIOS,
        });

      // eslint-disable-next-line no-console
      console.log(
        JSON.stringify(
          {
            summaryPath,
            resultsPath,
            passed: summary.passed,
            failed: summary.failed,
            toolSelectionAccuracy: summary.toolSelectionAccuracy,
            avgLatencyMs: summary.avgLatencyMs,
            totalTokens: summary.totalTokens,
            estimatedCostUsd: summary.estimatedCostUsd,
            failures: results
              .filter((r) => !r.success)
              .map((r) => ({
                id: r.scenarioId,
                kind: r.failureKind,
                checks: r.checks.filter((c) => !c.pass),
              })),
          },
          null,
          2,
        ),
      );

      expect(summary.totalScenarios).toBe(LIVE_SCENARIOS.length);
      expect(summary.failed, 'live evaluation had failing scenarios').toBe(0);
    },
    30 * 60_000,
  );
});
