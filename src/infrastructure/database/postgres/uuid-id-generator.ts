import { randomUUID } from 'node:crypto';
import type { IdGenerator } from '../../../ports/platform/time.js';

/**
 * Application-owned identity generation.
 * PostgreSQL stores these UUIDs; the DB does not generate domain IDs.
 * Prefix is ignored — kept for IdGenerator interface compatibility.
 */
export class UuidIdGenerator implements IdGenerator {
  generate(_prefix = 'id'): string {
    return randomUUID();
  }
}
