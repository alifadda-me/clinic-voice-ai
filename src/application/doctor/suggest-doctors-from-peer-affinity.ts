import type { Doctor } from '../../domain/index.js';
import { asDoctorId, asPatientId } from '../../domain/index.js';
import type {
  DoctorRepository,
  PatientRepository,
} from '../../ports/clinic/repositories.js';
import type { KnowledgeGraph } from '../../ports/platform/knowledge-graph.js';
import { KnowledgeGraphUnavailableError } from '../../ports/platform/knowledge-graph.js';
import { PatientNotFoundError } from '../shared/errors.js';
import { PREFERS, VISITED } from '../graph/relation-types.js';

export type SuggestDoctorsFromPeerAffinityInput = {
  /** Authenticated patient — graph cannot invent identity. */
  patientId: string;
  limit?: number;
};

export type SuggestDoctorsFromPeerAffinityResult = {
  doctors: Doctor[];
  scores: Record<string, number>;
};

/**
 * Peer-affinity enrichment: patients who share specialty preferences and
 * visited doctors. Graph returns candidate ids; eligibility is applied after
 * Postgres hydrate (active doctors only). Never fabricates on outage.
 *
 * Path: Patient -[:PREFERS]-> Specialty <-[:PREFERS]- Peer -[:VISITED]-> Doctor
 */
export class SuggestDoctorsFromPeerAffinity {
  constructor(
    private readonly patients: PatientRepository,
    private readonly doctors: DoctorRepository,
    private readonly knowledgeGraph: KnowledgeGraph,
  ) {}

  async execute(
    input: SuggestDoctorsFromPeerAffinityInput,
  ): Promise<SuggestDoctorsFromPeerAffinityResult> {
    const patientId = asPatientId(input.patientId);
    const patient = await this.patients.findById(patientId);
    if (!patient) {
      throw new PatientNotFoundError(input.patientId);
    }

    const limit = input.limit ?? 10;

    let hits;
    try {
      hits = await this.knowledgeGraph.findConvergingTargets({
        startId: patientId,
        outwardRelation: PREFERS,
        inwardPeerRelation: PREFERS,
        peerOutwardRelation: VISITED,
        excludeStartAsPeer: true,
        limit: limit * 3,
      });
    } catch (error) {
      if (error instanceof KnowledgeGraphUnavailableError) throw error;
      throw new KnowledgeGraphUnavailableError(
        error instanceof Error ? error.message : 'Peer affinity query failed',
      );
    }

    const doctors: Doctor[] = [];
    const scores: Record<string, number> = {};

    for (const hit of hits) {
      if (doctors.length >= limit) break;

      const doctor = await this.doctors.findById(asDoctorId(hit.id));
      if (!doctor || !doctor.active) continue;

      doctors.push(doctor);
      scores[doctor.id] = hit.score;
    }

    return { doctors, scores };
  }
}
