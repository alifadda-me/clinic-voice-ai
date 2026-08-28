import { Router } from 'express';

export type HealthProbeResult = {
  name: string;
  /** required probes must be ok for readiness 200 */
  required: boolean;
  ok: boolean;
  detail?: string | undefined;
  latencyMs?: number | undefined;
};

export type HealthProbes = {
  /** Always-on liveness (process up). */
  live?: () => Promise<void> | void;
  /** Named dependency probes for readiness. */
  check: () => Promise<HealthProbeResult[]>;
};

/**
 * Liveness + readiness — no clinic business logic.
 * GET /health — process alive
 * GET /ready — required deps ok; optional deps reported but do not fail readiness
 *              unless configured as required (Postgres + Redis required).
 */
export function createHealthRouter(probes: HealthProbes): Router {
  const router = Router();

  router.get('/health', async (_req, res) => {
    try {
      await probes.live?.();
      res.status(200).json({ status: 'ok' });
    } catch (error) {
      res.status(503).json({
        status: 'error',
        message: error instanceof Error ? error.message : 'unhealthy',
      });
    }
  });

  router.get('/ready', async (_req, res) => {
    const started = Date.now();
    let results: HealthProbeResult[];
    try {
      results = await probes.check();
    } catch (error) {
      res.status(503).json({
        status: 'not_ready',
        message: error instanceof Error ? error.message : 'readiness check failed',
        durationMs: Date.now() - started,
      });
      return;
    }

    const requiredFailed = results.filter((r) => r.required && !r.ok);
    const status = requiredFailed.length === 0 ? 'ready' : 'not_ready';
    const code = status === 'ready' ? 200 : 503;

    res.status(code).json({
      status,
      durationMs: Date.now() - started,
      checks: results,
    });
  });

  return router;
}
