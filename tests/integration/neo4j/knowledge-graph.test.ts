import { beforeAll, describe, expect, it } from 'vitest';
import { config as loadDotenv } from 'dotenv';
import neo4j from 'neo4j-driver';
import { loadNeo4jKnowledgeGraphConfig } from '../../../src/config/neo4j.js';
import {
  createSdkNeo4jDriver,
  Neo4jKnowledgeGraph,
} from '../../../src/infrastructure/graph/neo4j/index.js';
import { createTestWorld } from '../../helpers/test-world.js';
import { defineKnowledgeGraphContract } from '../../graph/knowledge-graph.contract.js';
import {
  RebuildPatientAffinityGraph,
  SuggestDoctorsFromPeerAffinity,
} from '../../../src/application/index.js';
import { KnowledgeGraphUnavailableError } from '../../../src/ports/platform/knowledge-graph.js';

loadDotenv();

const neo4jConfigured = Boolean(process.env.NEO4J_URI?.trim());

async function neo4jReachable(): Promise<boolean> {
  if (!neo4jConfigured) return false;
  try {
    const config = loadNeo4jKnowledgeGraphConfig(process.env);
    const driver = neo4j.driver(
      config.uri,
      neo4j.auth.basic(config.user, config.password),
    );
    try {
      await driver.verifyConnectivity();
      return true;
    } finally {
      await driver.close();
    }
  } catch {
    return false;
  }
}

describe('Neo4j integration (opt-in)', () => {
  let ready = false;

  beforeAll(async () => {
    ready = await neo4jReachable();
  });

  it('is skipped when NEO4J_URI is unset (opt-in only)', () => {
    if (!neo4jConfigured) {
      expect(ready).toBe(false);
    }
  });

  describe.runIf(neo4jConfigured)('when NEO4J_URI is set', () => {
    beforeAll(async () => {
      if (!ready) {
        throw new Error(
          'NEO4J_URI is set but Neo4j is unreachable. Run: docker compose up -d neo4j',
        );
      }
    });

    defineKnowledgeGraphContract(
      'Neo4jKnowledgeGraph',
      () => {
        const config = loadNeo4jKnowledgeGraphConfig(process.env);
        const driver = createSdkNeo4jDriver(config);
        return new Neo4jKnowledgeGraph(driver, config.database);
      },
      {
        afterEach: async (graph) => {
          await graph.replaceGraph({ nodes: [], relations: [] });
          if ('close' in graph && typeof graph.close === 'function') {
            await graph.close();
          }
        },
      },
    );

    it('rebuild + SuggestDoctorsFromPeerAffinity hydrates and skips inactive', async () => {
      const config = loadNeo4jKnowledgeGraphConfig(process.env);
      const graph = new Neo4jKnowledgeGraph(
        createSdkNeo4jDriver(config),
        config.database,
      );
      try {
        const world = createTestWorld();
        const seed = await world.seed();
        const patientA = (
          await world.useCases.registerPatient.execute({
            phoneNumber: '+201111111111',
            fullName: 'Neo A',
          })
        ).patient;
        const patientB = (
          await world.useCases.registerPatient.execute({
            phoneNumber: '+201111111112',
            fullName: 'Neo B',
          })
        ).patient;

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
          start: '2026-08-25T12:00:00.000Z',
          end: '2026-08-25T12:30:00.000Z',
        });
        await world.useCases.completeAppointment.execute({
          appointmentId: appt.id,
        });

        // Inject inactive visit into graph via rebuild source: complete inactive?
        // Prefer manual graph edge then prove Suggest filters via PG hydrate.
        const rebuild = new RebuildPatientAffinityGraph(
          world.preferences,
          world.appointments,
          graph,
        );
        await rebuild.execute();

        await graph.addRelation({
          subjectId: patientB.id,
          relationType: 'VISITED',
          objectId: seed.inactive.id,
        });

        const suggest = new SuggestDoctorsFromPeerAffinity(
          world.patients,
          world.doctors,
          graph,
        );
        const result = await suggest.execute({ patientId: patientA.id });
        expect(result.doctors.map((d) => d.id)).toContain(seed.drSara.id);
        expect(result.doctors.map((d) => d.id)).not.toContain(
          seed.inactive.id,
        );
      } finally {
        await graph.replaceGraph({ nodes: [], relations: [] });
        await graph.close();
      }
    });

    it('maps unreachable Neo4j to KnowledgeGraphUnavailableError (no fabricate)', async () => {
      const down = new Neo4jKnowledgeGraph(
        {
          session() {
            throw new Error('simulated neo4j down');
          },
          async close() {},
        },
        'neo4j',
      );
      const world = createTestWorld();
      await world.seed();
      const patient = (
        await world.useCases.registerPatient.execute({
          phoneNumber: '+201111111199',
        })
      ).patient;

      const suggest = new SuggestDoctorsFromPeerAffinity(
        world.patients,
        world.doctors,
        down,
      );
      await expect(
        suggest.execute({ patientId: patient.id }),
      ).rejects.toBeInstanceOf(KnowledgeGraphUnavailableError);
    });
  });
});
