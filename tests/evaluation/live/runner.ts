import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import type { ChatModel } from '../../../src/ports/platform/chat-model.js';
import {
  estimateCostUsd,
  type LiveEvalSummary,
  type LiveFailureKind,
  type LiveScenarioMetrics,
} from './metrics.js';
import {
  LIVE_SCENARIOS,
  type LiveScenarioDefinition,
} from './scenarios.js';

export type LiveEvalRunOptions = {
  chatModel: ChatModel;
  provider: string;
  modelName: string;
  resultsDir?: string;
  scenarios?: LiveScenarioDefinition[];
};

export type LiveEvalRunOutcome = {
  summary: LiveEvalSummary;
  results: LiveScenarioMetrics[];
  resultsPath: string;
  summaryPath: string;
};

/**
 * Runs live scenarios sequentially (isolated world per scenario).
 * Does NOT retry mutating scenarios after failure — avoids unclear booking state.
 */
export async function runLiveEvaluation(
  options: LiveEvalRunOptions,
): Promise<LiveEvalRunOutcome> {
  const scenarios = options.scenarios ?? LIVE_SCENARIOS;
  const resultsDir =
    options.resultsDir ??
    path.join(process.cwd(), 'evaluation-results');
  await mkdir(resultsDir, { recursive: true });

  const stamp = new Date().toISOString().replace(/[:.]/g, '-');
  const resultsPath = path.join(resultsDir, `live-${stamp}.jsonl`);
  const summaryPath = path.join(resultsDir, `live-${stamp}-summary.json`);

  const startedAt = new Date().toISOString();
  const results: LiveScenarioMetrics[] = [];

  for (const scenario of scenarios) {
    const scenarioStarted = Date.now();
    const startedIso = new Date(scenarioStarted).toISOString();
    const outcome = await scenario.run(options.chatModel);
    const finishedIso = new Date().toISOString();
    const latencyMs = Date.now() - scenarioStarted;

    const failedChecks = outcome.checks.filter((c) => !c.pass);
    let failureKind: LiveFailureKind = 'none';
    let success = failedChecks.length === 0;

    if (outcome.failureKindHint) {
      failureKind = outcome.failureKindHint;
      success = false;
    } else if (!success) {
      failureKind = 'assertion_failure';
    }

    const estimatedCostUsd = estimateCostUsd(options.modelName, {
      promptTokens: outcome.promptTokens,
      completionTokens: outcome.completionTokens,
    });

    const row: LiveScenarioMetrics = {
      scenarioId: scenario.id,
      description: scenario.description,
      category: scenario.category,
      provider: options.provider,
      modelName: options.modelName,
      startedAt: startedIso,
      finishedAt: finishedIso,
      latencyMs,
      modelCallCount: outcome.modelCallCount,
      toolCallCount: outcome.toolNamesInvoked.length,
      toolNamesInvoked: outcome.toolNamesInvoked,
      expectedToolsIncludes: scenario.expectedToolsIncludes,
      expectedToolsForbidden: scenario.expectedToolsForbidden,
      promptTokens: outcome.promptTokens || null,
      completionTokens: outcome.completionTokens || null,
      totalTokens: outcome.totalTokens || null,
      estimatedCostUsd,
      success,
      failureKind,
      checks: outcome.checks,
      expectedSideEffect: scenario.expectedSideEffect,
      actualSideEffect: outcome.actualSideEffect,
      finalResponse: outcome.finalResponse,
      ...(outcome.naturalLanguageNotes
        ? { naturalLanguageNotes: outcome.naturalLanguageNotes }
        : {}),
    };

    results.push(row);
    await appendJsonl(resultsPath, row);
  }

  const finishedAt = new Date().toISOString();
  const passed = results.filter((r) => r.success).length;
  const failed = results.length - passed;

  const toolSelectionRows = results.filter(
    (r) =>
      r.expectedToolsIncludes.length > 0 &&
      r.failureKind !== 'provider_failure' &&
      r.failureKind !== 'scenario_timeout' &&
      r.failureKind !== 'missing_credentials',
  );
  const toolSelectionHits = toolSelectionRows.filter((r) =>
    r.expectedToolsIncludes.every((t) => r.toolNamesInvoked.includes(t)),
  ).length;

  const mutationRows = results.filter((r) =>
    scenarios.find((s) => s.id === r.scenarioId)?.isMutation,
  );
  const safetyRows = results.filter((r) =>
    scenarios.find((s) => s.id === r.scenarioId)?.isSafety,
  );

  const totalLatencyMs = results.reduce((sum, r) => sum + r.latencyMs, 0);
  const tokenSum = results.reduce((sum, r) => sum + (r.totalTokens ?? 0), 0);
  const costSum = results.reduce(
    (sum, r) => sum + (r.estimatedCostUsd ?? 0),
    0,
  );
  const anyTokens = results.some((r) => r.totalTokens != null && r.totalTokens > 0);
  const anyCost = results.some((r) => r.estimatedCostUsd != null);

  const summary: LiveEvalSummary = {
    provider: options.provider,
    modelName: options.modelName,
    startedAt,
    finishedAt,
    totalScenarios: results.length,
    passed,
    failed,
    toolSelectionAccuracy:
      toolSelectionRows.length === 0
        ? 1
        : toolSelectionHits / toolSelectionRows.length,
    mutationScenariosPassed: mutationRows.filter((r) => r.success).length,
    mutationScenariosTotal: mutationRows.length,
    safetyScenariosPassed: safetyRows.filter((r) => r.success).length,
    safetyScenariosTotal: safetyRows.length,
    totalLatencyMs,
    avgLatencyMs:
      results.length === 0 ? 0 : Math.round(totalLatencyMs / results.length),
    totalTokens: anyTokens ? tokenSum : null,
    estimatedCostUsd: anyCost ? Number(costSum.toFixed(6)) : null,
    resultsPath,
  };

  await writeFile(summaryPath, `${JSON.stringify(summary, null, 2)}\n`, 'utf8');

  return { summary, results, resultsPath, summaryPath };
}

async function appendJsonl(
  filePath: string,
  row: LiveScenarioMetrics,
): Promise<void> {
  const { appendFile } = await import('node:fs/promises');
  await appendFile(filePath, `${JSON.stringify(row)}\n`, 'utf8');
}
