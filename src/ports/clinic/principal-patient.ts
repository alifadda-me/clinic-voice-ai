/**
 * Maps an authenticated principal to a clinic patient.
 * PostgreSQL is the SoT in production; in-memory for tests/demo/eval.
 *
 * Never store this mapping in Redis. Never link by phone alone.
 */

export interface PrincipalPatientDirectory {
  findPatientId(subjectId: string): Promise<string | null>;
  /** Inverse lookup for 1:1 enforcement (one patient ↔ one principal). */
  findSubjectId(patientId: string): Promise<string | null>;
  /**
   * Persist principal→patient. Implementations must reject conflicting
   * rebinds (same subject→other patient, or patient already linked elsewhere).
   */
  link(subjectId: string, patientId: string): Promise<void>;
}
