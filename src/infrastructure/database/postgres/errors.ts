import {
  DuplicateEntityError,
  SchedulingConflictError,
} from '../../../domain/shared/errors.js';

/**
 * Translate Postgres/driver errors into domain errors.
 * Never leak SQLSTATE / driver types upward.
 * Infrastructure must not import application.
 */

type PgLikeError = {
  code?: string;
  constraint?: string;
  message?: string;
};

export function translatePostgresError(error: unknown): never {
  const pgError = extractPgError(error);

  if (pgError?.code === '23P01' || isExclusionMessage(error)) {
    throw new SchedulingConflictError(
      'Appointment overlaps an existing scheduled appointment',
    );
  }

  if (pgError?.code === '23505') {
    if (pgError.constraint?.includes('idempotency')) {
      throw new DuplicateEntityError('Idempotency key already used');
    }
    if (pgError.constraint?.includes('phone')) {
      throw new DuplicateEntityError(
        'A patient with this phone number already exists',
      );
    }
    throw new DuplicateEntityError('Unique constraint violated');
  }

  if (pgError?.code === '23503') {
    throw new DuplicateEntityError('Referenced record does not exist');
  }

  if (pgError?.code === '23514') {
    throw new DuplicateEntityError('Database check constraint violated');
  }

  throw error instanceof Error ? error : new Error(String(error));
}

export function isExclusionViolation(error: unknown): boolean {
  const pgError = extractPgError(error);
  return pgError?.code === '23P01' || isExclusionMessage(error);
}

export function isUniqueViolation(
  error: unknown,
  constraintSubstring?: string,
): boolean {
  const pgError = extractPgError(error);
  if (pgError?.code !== '23505') return false;
  if (!constraintSubstring) return true;
  return pgError.constraint?.includes(constraintSubstring) ?? false;
}

function isExclusionMessage(error: unknown): boolean {
  const messages: string[] = [];
  let current: unknown = error;
  for (let i = 0; i < 6 && current; i += 1) {
    if (current instanceof Error) messages.push(current.message);
    current = (current as { cause?: unknown }).cause;
  }
  return messages.some(
    (m) =>
      m.includes('exclusion') ||
      m.includes('appointments_doctor_no_overlap') ||
      m.includes('appointments_patient_no_overlap') ||
      m.includes('23P01'),
  );
}

function extractPgError(error: unknown): PgLikeError | null {
  let current: unknown = error;
  for (let i = 0; i < 6 && current; i += 1) {
    if (current && typeof current === 'object') {
      const candidate = current as PgLikeError;
      if (typeof candidate.code === 'string' && candidate.code.length > 0) {
        return candidate;
      }
    }
    current = (current as { cause?: unknown } | null)?.cause;
  }
  return null;
}
