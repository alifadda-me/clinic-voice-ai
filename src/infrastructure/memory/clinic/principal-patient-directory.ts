import type { PrincipalPatientDirectory } from '../../../ports/clinic/principal-patient.js';

/**
 * In-memory principal↔patient map for tests / demo / eval.
 * Enforces 1:1 like the Postgres adapter.
 */
export class InMemoryPrincipalPatientDirectory
  implements PrincipalPatientDirectory
{
  private readonly bySubject = new Map<string, string>();
  private readonly byPatient = new Map<string, string>();

  async findPatientId(subjectId: string): Promise<string | null> {
    return this.bySubject.get(subjectId) ?? null;
  }

  async findSubjectId(patientId: string): Promise<string | null> {
    return this.byPatient.get(patientId) ?? null;
  }

  async link(subjectId: string, patientId: string): Promise<void> {
    const existingPatient = this.bySubject.get(subjectId);
    if (existingPatient && existingPatient !== patientId) {
      throw new Error('Principal is already linked to a different patient');
    }
    const existingSubject = this.byPatient.get(patientId);
    if (existingSubject && existingSubject !== subjectId) {
      throw new Error('Patient is already linked to a different principal');
    }
    this.bySubject.set(subjectId, patientId);
    this.byPatient.set(patientId, subjectId);
  }
}
