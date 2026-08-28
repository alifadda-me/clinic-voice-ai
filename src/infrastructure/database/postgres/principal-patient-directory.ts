import { eq } from 'drizzle-orm';
import type { PrincipalPatientDirectory } from '../../../ports/clinic/principal-patient.js';
import type { PostgresDatabase } from './client.js';
import { principalPatientLinks } from './schema.js';
import { translatePostgresError } from './errors.js';

/**
 * Durable principal↔patient directory in PostgreSQL.
 * Survives process restart and is shared across application instances.
 */
export class PostgresPrincipalPatientDirectory
  implements PrincipalPatientDirectory
{
  constructor(private readonly db: PostgresDatabase) {}

  async findPatientId(subjectId: string): Promise<string | null> {
    try {
      const rows = await this.db
        .select({ patientId: principalPatientLinks.patientId })
        .from(principalPatientLinks)
        .where(eq(principalPatientLinks.subjectId, subjectId))
        .limit(1);
      return rows[0]?.patientId ?? null;
    } catch (error) {
      translatePostgresError(error);
    }
  }

  async findSubjectId(patientId: string): Promise<string | null> {
    try {
      const rows = await this.db
        .select({ subjectId: principalPatientLinks.subjectId })
        .from(principalPatientLinks)
        .where(eq(principalPatientLinks.patientId, patientId))
        .limit(1);
      return rows[0]?.subjectId ?? null;
    } catch (error) {
      translatePostgresError(error);
    }
  }

  async link(subjectId: string, patientId: string): Promise<void> {
    try {
      const existingSubject = await this.findPatientId(subjectId);
      if (existingSubject && existingSubject !== patientId) {
        throw new Error('Principal is already linked to a different patient');
      }
      if (existingSubject === patientId) {
        return;
      }

      const existingPatient = await this.findSubjectId(patientId);
      if (existingPatient && existingPatient !== subjectId) {
        throw new Error('Patient is already linked to a different principal');
      }

      await this.db.insert(principalPatientLinks).values({
        subjectId,
        patientId,
        linkedAt: new Date(),
      });
    } catch (error) {
      if (error instanceof Error && /already linked/i.test(error.message)) {
        throw error;
      }
      translatePostgresError(error);
    }
  }
}
