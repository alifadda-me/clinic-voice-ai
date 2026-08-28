import { AppointmentStatuses } from '../../domain/index.js';
import type {
  AppointmentRepository,
  PreferenceRepository,
} from '../../ports/clinic/repositories.js';
import type {
  GraphNode,
  GraphRelation,
  GraphSnapshot,
  KnowledgeGraph,
} from '../../ports/platform/knowledge-graph.js';
import { KnowledgeGraphUnavailableError } from '../../ports/platform/knowledge-graph.js';
import { PREFERS, VISITED } from './relation-types.js';

export type RebuildPatientAffinityGraphResult = {
  nodeCount: number;
  relationCount: number;
};

/**
 * Rebuilds the disposable patient-affinity graph from authoritative repos.
 * Reads preferences (specialty) + completed appointments; writes KnowledgeGraph only.
 * No dual-write from book/cancel/prefs — call this explicitly.
 * Full replace removes stale edges/nodes absent from the new snapshot.
 */
export class RebuildPatientAffinityGraph {
  constructor(
    private readonly preferences: PreferenceRepository,
    private readonly appointments: AppointmentRepository,
    private readonly knowledgeGraph: KnowledgeGraph,
  ) {}

  async execute(): Promise<RebuildPatientAffinityGraphResult> {
    const [prefs, appointments] = await Promise.all([
      this.preferences.listAll(),
      this.appointments.findMany({}),
    ]);

    const specialtyPrefs = prefs.filter(
      (p) => p.kind === 'specialty' && p.specialtyId,
    );
    const completed = appointments.filter(
      (a) => a.status === AppointmentStatuses.Completed,
    );

    const nodesById = new Map<string, GraphNode>();

    const ensureNode = (id: string, label: string) => {
      const existing = nodesById.get(id);
      if (existing) {
        const labels = new Set(existing.labels ?? []);
        labels.add(label);
        nodesById.set(id, { id, labels: [...labels] });
        return;
      }
      nodesById.set(id, { id, labels: [label] });
    };

    const relations: Array<
      Omit<GraphRelation, 'createdAt'> & { createdAt?: Date }
    > = [];
    const seenRel = new Set<string>();

    const addRelation = (
      subjectId: string,
      relationType: string,
      objectId: string,
    ) => {
      const key = `${subjectId}|${relationType}|${objectId}`;
      if (seenRel.has(key)) return;
      seenRel.add(key);
      relations.push({ subjectId, relationType, objectId });
    };

    for (const pref of specialtyPrefs) {
      const specialtyId = pref.specialtyId!;
      ensureNode(pref.patientId, 'Patient');
      ensureNode(specialtyId, 'Specialty');
      addRelation(pref.patientId, PREFERS, specialtyId);
    }

    for (const appt of completed) {
      ensureNode(appt.patientId, 'Patient');
      ensureNode(appt.doctorId, 'Doctor');
      addRelation(appt.patientId, VISITED, appt.doctorId);
    }

    const snapshot: GraphSnapshot = {
      nodes: [...nodesById.values()],
      relations,
    };

    try {
      await this.knowledgeGraph.replaceGraph(snapshot);
    } catch (error) {
      if (error instanceof KnowledgeGraphUnavailableError) throw error;
      throw new KnowledgeGraphUnavailableError(
        error instanceof Error ? error.message : 'Graph rebuild failed',
      );
    }

    return {
      nodeCount: snapshot.nodes.length,
      relationCount: snapshot.relations.length,
    };
  }
}
