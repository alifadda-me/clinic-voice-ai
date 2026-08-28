import { beforeEach, describe, expect, it } from 'vitest';
import {
  PREFERS,
  VISITED,
  AppointmentNotOwnedError,
} from '../../src/application/index.js';
import { KnowledgeGraphUnavailableError } from '../../src/ports/platform/knowledge-graph.js';
import { createTestWorld, type TestWorld } from '../helpers/test-world.js';

describe('Patient affinity graph (rebuild + suggest)', () => {
  let world: TestWorld;
  let seed: Awaited<ReturnType<TestWorld['seed']>>;

  beforeEach(async () => {
    world = createTestWorld();
    seed = await world.seed();
  });

  async function register(phone: string, name: string) {
    const { patient } = await world.useCases.registerPatient.execute({
      phoneNumber: phone,
      fullName: name,
    });
    return patient;
  }

  async function seedPeerAffinity() {
    const patientA = await register('+201000000001', 'Patient A');
    const patientB = await register('+201000000002', 'Patient B');

    await world.useCases.savePatientPreference.execute({
      patientId: patientA.id,
      kind: 'specialty',
      value: 'Cardiology',
      specialtyId: seed.cardiology.id,
    });
    await world.useCases.savePatientPreference.execute({
      patientId: patientB.id,
      kind: 'specialty',
      value: 'Cardiology',
      specialtyId: seed.cardiology.id,
    });

    const appt = await world.useCases.bookAppointment.execute({
      patientId: patientB.id,
      doctorId: seed.drSara.id,
      start: '2026-08-25T10:00:00.000Z',
      end: '2026-08-25T10:30:00.000Z',
    });
    await world.useCases.completeAppointment.execute({
      appointmentId: appt.id,
    });

    // Scheduled-only visit must not create VISITED
    await world.useCases.bookAppointment.execute({
      patientId: patientB.id,
      doctorId: seed.drOmar.id,
      start: '2026-08-26T10:00:00.000Z',
      end: '2026-08-26T10:30:00.000Z',
    });

    const rebuild =
      await world.useCases.rebuildPatientAffinityGraph.execute();

    return { patientA, patientB, rebuild };
  }

  it('rebuilds PREFERS + VISITED from specialty prefs and completed appointments', async () => {
    const { patientA, patientB, rebuild } = await seedPeerAffinity();
    expect(rebuild.relationCount).toBeGreaterThanOrEqual(3);

    const prefersA = await world.knowledgeGraph.listRelations(
      patientA.id,
      PREFERS,
    );
    expect(prefersA.map((r) => r.objectId)).toEqual([seed.cardiology.id]);

    const visitedB = await world.knowledgeGraph.listRelations(
      patientB.id,
      VISITED,
    );
    expect(visitedB.map((r) => r.objectId)).toEqual([seed.drSara.id]);
  });

  it('suggest returns peer-visited doctors hydrated from doctor repo', async () => {
    const { patientA } = await seedPeerAffinity();
    const result =
      await world.useCases.suggestDoctorsFromPeerAffinity.execute({
        patientId: patientA.id,
      });
    expect(result.doctors.map((d) => d.id)).toEqual([seed.drSara.id]);
    expect(result.scores[seed.drSara.id]).toBe(1);
    expect(result.doctors[0]?.fullName).toBe('Dr Sara Hassan');
  });

  it('skips inactive doctors even when present in the graph', async () => {
    const { patientA, patientB } = await seedPeerAffinity();
    await world.knowledgeGraph.addRelation({
      subjectId: patientB.id,
      relationType: VISITED,
      objectId: seed.inactive.id,
    });

    const result =
      await world.useCases.suggestDoctorsFromPeerAffinity.execute({
        patientId: patientA.id,
      });
    expect(result.doctors.map((d) => d.id)).not.toContain(seed.inactive.id);
    expect(result.doctors.map((d) => d.id)).toContain(seed.drSara.id);
  });

  it('removes stale graph edges on rebuild', async () => {
    const { patientA, patientB } = await seedPeerAffinity();
    await world.knowledgeGraph.addRelation({
      subjectId: patientB.id,
      relationType: VISITED,
      objectId: 'ghost_doc',
    });

    let hits = await world.knowledgeGraph.findConvergingTargets({
      startId: patientA.id,
      outwardRelation: PREFERS,
      inwardPeerRelation: PREFERS,
      peerOutwardRelation: VISITED,
    });
    expect(hits.map((h) => h.id)).toContain('ghost_doc');

    await world.useCases.rebuildPatientAffinityGraph.execute();
    hits = await world.knowledgeGraph.findConvergingTargets({
      startId: patientA.id,
      outwardRelation: PREFERS,
      inwardPeerRelation: PREFERS,
      peerOutwardRelation: VISITED,
    });
    expect(hits.map((h) => h.id)).not.toContain('ghost_doc');
  });

  it('is idempotent across repeated rebuilds', async () => {
    await seedPeerAffinity();
    const first = await world.useCases.rebuildPatientAffinityGraph.execute();
    const second = await world.useCases.rebuildPatientAffinityGraph.execute();
    expect(second).toEqual(first);
  });

  it('surfaces KnowledgeGraphUnavailableError and does not fabricate doctors', async () => {
    const { patientA } = await seedPeerAffinity();
    world.knowledgeGraph.setUnavailable(true);

    await expect(
      world.useCases.suggestDoctorsFromPeerAffinity.execute({
        patientId: patientA.id,
      }),
    ).rejects.toBeInstanceOf(KnowledgeGraphUnavailableError);

    await expect(
      world.useCases.rebuildPatientAffinityGraph.execute(),
    ).rejects.toBeInstanceOf(KnowledgeGraphUnavailableError);
  });

  it('cancel still requires ownership — graph cannot bypass', async () => {
    const { patientA, patientB } = await seedPeerAffinity();
    const appt = await world.useCases.bookAppointment.execute({
      patientId: patientA.id,
      doctorId: seed.drSara.id,
      start: '2026-08-27T10:00:00.000Z',
      end: '2026-08-27T10:30:00.000Z',
    });

    await expect(
      world.useCases.cancelAppointment.execute({
        appointmentId: appt.id,
        patientId: patientB.id,
      }),
    ).rejects.toBeInstanceOf(AppointmentNotOwnedError);
  });

  it('rebuild snapshot never stores phone/auth/chat properties', async () => {
    const { patientA } = await seedPeerAffinity();
    // Patient was registered with a phone — graph must only hold opaque ids.
    const prefers = await world.knowledgeGraph.listRelations(patientA.id);
    for (const rel of prefers) {
      expect(rel).not.toHaveProperty('phoneNumber');
      expect(JSON.stringify(rel)).not.toMatch(/phone|jwt|transcript/i);
    }

    await expect(
      world.knowledgeGraph.replaceGraph({
        nodes: [
          {
            id: patientA.id,
            properties: { phoneNumber: '+201000000001' },
          },
        ],
        relations: [],
      }),
    ).rejects.toBeInstanceOf(KnowledgeGraphUnavailableError);
  });

  it('booking succeeds while knowledge graph is unavailable', async () => {
    const patient = await register('+201000000099', 'Lone');
    world.knowledgeGraph.setUnavailable(true);

    const appt = await world.useCases.bookAppointment.execute({
      patientId: patient.id,
      doctorId: seed.drSara.id,
      start: '2026-08-28T10:00:00.000Z',
      end: '2026-08-28T10:30:00.000Z',
    });
    expect(appt.status).toBe('scheduled');
  });
});
