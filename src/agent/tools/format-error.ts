import { ZodError } from 'zod';
import { ApplicationError } from '../../application/shared/errors.js';
import {
  DoctorInactiveError,
  SchedulingConflictError,
} from '../../domain/index.js';
import type { ToolResult } from './types.js';

/** Application codes whose messages are safe for the model (domain/app policy). */
const SAFE_APPLICATION_CODES = new Set([
  'PATIENT_NOT_FOUND',
  'DOCTOR_NOT_FOUND',
  'APPOINTMENT_NOT_FOUND',
  'SPECIALTY_NOT_FOUND',
  'NOT_FOUND',
  'CONFLICT',
  'VALIDATION',
  'APPOINTMENT_NOT_OWNED',
  'TIME_SLOT_UNAVAILABLE',
  'PATIENT_NOT_IDENTIFIED',
]);

/**
 * Map domain/application failures to safe tool results.
 * Never forward SQL, provider stacks, or raw infrastructure errors.
 */
export function formatToolError(error: unknown): ToolResult {
  if (error instanceof ZodError) {
    return {
      ok: false,
      code: 'INVALID_ARGUMENTS',
      message: error.issues.map((i) => i.message).join('; ') || 'Invalid arguments',
    };
  }

  if (error instanceof ApplicationError) {
    if (error.code.startsWith('CALENDAR_') || error.code.startsWith('EXTERNAL_')) {
      return {
        ok: false,
        code: error.code,
        message: sanitizeExternalMessage(error.code),
      };
    }
    if (SAFE_APPLICATION_CODES.has(error.code)) {
      return { ok: false, code: error.code, message: error.message };
    }
    return {
      ok: false,
      code: error.code,
      message: 'The request could not be completed.',
    };
  }

  if (error instanceof SchedulingConflictError) {
    return { ok: false, code: 'SCHEDULING_CONFLICT', message: error.message };
  }

  if (error instanceof DoctorInactiveError) {
    return { ok: false, code: 'DOCTOR_INACTIVE', message: error.message };
  }

  if (error instanceof Error) {
    const name = error.name;
    if (
      name.includes('Calendar') ||
      name.includes('WorkingMemory') ||
      name.includes('SemanticSearch') ||
      name.includes('KnowledgeGraph') ||
      name.includes('Embedding') ||
      name.includes('ChatModel')
    ) {
      return {
        ok: false,
        code: 'DEPENDENCY_UNAVAILABLE',
        message: 'A required service is temporarily unavailable. Please try again.',
      };
    }
  }

  return {
    ok: false,
    code: 'INTERNAL_ERROR',
    message: 'Something went wrong while processing that request.',
  };
}

function sanitizeExternalMessage(code: string): string {
  switch (code) {
    case 'CALENDAR_UNAVAILABLE':
      return 'Calendar is temporarily unavailable';
    case 'CALENDAR_CONFIGURATION':
      return 'Calendar is misconfigured';
    case 'CALENDAR_RESERVATION_NOT_FOUND':
      return 'Calendar reservation was not found';
    case 'CALENDAR_OPERATION_FAILED':
      return 'Calendar operation failed';
    case 'TIME_SLOT_UNAVAILABLE':
      return 'Requested time slot is unavailable';
    default:
      return 'An external dependency failed';
  }
}

export function patientRequiredResult(): ToolResult {
  return {
    ok: false,
    code: 'PATIENT_NOT_IDENTIFIED',
    message:
      'An authenticated patient is required for this action. Discovery and availability do not require authentication.',
  };
}
