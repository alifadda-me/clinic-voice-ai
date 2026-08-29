import type { Request, Response, NextFunction } from 'express';
import {
  loadTraceLoggingConfig,
  logTraceEvent,
} from '../../config/trace-logging.js';
import { sanitizeRequestBodyForLog } from './sanitize-request-body-for-log.js';

/**
 * Logs one JSON line per HTTP response when LOG_TRACE or LOG_HTTP is set.
 * Mount after express.json() so req.body is available.
 * Never logs Authorization header values.
 */
export function createRequestLoggingMiddleware() {
  const enabled = loadTraceLoggingConfig().http;

  if (!enabled) {
    return (_req: Request, _res: Response, next: NextFunction) => next();
  }

  return (req: Request, res: Response, next: NextFunction) => {
    const started = Date.now();
    res.on('finish', () => {
      const requestBody =
        req.body &&
        typeof req.body === 'object' &&
        !Array.isArray(req.body) &&
        Object.keys(req.body as object).length > 0
          ? sanitizeRequestBodyForLog(req.body)
          : undefined;

      logTraceEvent({
        event: 'http_request',
        method: req.method,
        path: req.originalUrl.split('?')[0] ?? req.path,
        status: res.statusCode,
        latency_ms: Date.now() - started,
        ...(requestBody !== undefined ? { request_body: requestBody } : {}),
        ...(req.header('x-conversation-id')
          ? { conversation_id: req.header('x-conversation-id')?.trim() }
          : {}),
        ...(req.header('authorization') ? { has_authorization: true } : {}),
      });
    });
    next();
  };
}
