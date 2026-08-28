import { z } from 'zod';

const neo4jEnvSchema = z.object({
  NEO4J_URI: z.string().min(1).default('bolt://127.0.0.1:17687'),
  NEO4J_USER: z.string().min(1).default('neo4j'),
  NEO4J_PASSWORD: z.string().min(1).default('clinic-voice-ai'),
  NEO4J_DATABASE: z.string().min(1).default('neo4j'),
});

export type Neo4jKnowledgeGraphConfig = {
  uri: string;
  user: string;
  password: string;
  database: string;
};

/**
 * Load Neo4j adapter config. Composition only.
 */
export function loadNeo4jKnowledgeGraphConfig(
  env: NodeJS.ProcessEnv = process.env,
): Neo4jKnowledgeGraphConfig {
  const parsed = neo4jEnvSchema.parse({
    NEO4J_URI: env.NEO4J_URI,
    NEO4J_USER: env.NEO4J_USER,
    NEO4J_PASSWORD: env.NEO4J_PASSWORD,
    NEO4J_DATABASE: env.NEO4J_DATABASE,
  });
  return {
    uri: parsed.NEO4J_URI,
    user: parsed.NEO4J_USER,
    password: parsed.NEO4J_PASSWORD,
    database: parsed.NEO4J_DATABASE,
  };
}
