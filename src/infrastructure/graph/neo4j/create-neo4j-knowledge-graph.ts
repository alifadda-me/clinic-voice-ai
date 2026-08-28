import { loadNeo4jKnowledgeGraphConfig } from '../../../config/neo4j.js';
import type { KnowledgeGraph } from '../../../ports/platform/knowledge-graph.js';
import { createSdkNeo4jDriver } from './create-sdk-neo4j-driver.js';
import { Neo4jKnowledgeGraph } from './neo4j-knowledge-graph.js';

/**
 * Env → config → Neo4jKnowledgeGraph.
 * neo4j-driver remains under infrastructure/graph/neo4j only.
 */
export function createNeo4jKnowledgeGraph(
  env: NodeJS.ProcessEnv = process.env,
): KnowledgeGraph & { close(): Promise<void> } {
  const config = loadNeo4jKnowledgeGraphConfig(env);
  const driver = createSdkNeo4jDriver(config);
  return new Neo4jKnowledgeGraph(driver, config.database);
}
