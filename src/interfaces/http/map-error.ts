import type { Request, Response, NextFunction } from 'express';

export class HttpError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    message: string,
  ) {
    super(message);
    this.name = 'HttpError';
  }
}

/** Map failures to HTTP without leaking infrastructure details. */
export function mapErrorToHttp(error: unknown): {
  status: number;
  body: { error: { code: string; message: string } };
} {
  if (error instanceof HttpError) {
    return {
      status: error.status,
      body: { error: { code: error.code, message: error.message } },
    };
  }

  if (
    error instanceof Error &&
    error.name === 'InvalidAuthCredentialsError'
  ) {
    return {
      status: 401,
      body: {
        error: {
          code: 'INVALID_AUTH_CREDENTIALS',
          message: 'Authentication credentials are invalid',
        },
      },
    };
  }

  return {
    status: 500,
    body: {
      error: {
        code: 'INTERNAL_ERROR',
        message: 'An unexpected error occurred.',
      },
    },
  };
}

export function errorMiddleware(
  error: unknown,
  _req: Request,
  res: Response,
  _next: NextFunction,
): void {
  const mapped = mapErrorToHttp(error);
  res.status(mapped.status).json(mapped.body);
}
