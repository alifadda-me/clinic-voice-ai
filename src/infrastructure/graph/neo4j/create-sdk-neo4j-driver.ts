import neo4j from 'neo4j-driver';
import type { Neo4jKnowledgeGraphConfig } from '../../../config/neo4j.js';
import type { Neo4jDriverLike } from './neo4j-driver-like.js';

/**
 * SDK-backed Neo4j driver. Provider types stay inside this module.
 */
export function createSdkNeo4jDriver(
  config: Neo4jKnowledgeGraphConfig,
): Neo4jDriverLike {
  return neo4j.driver(
    config.uri,
    neo4j.auth.basic(config.user, config.password),
  );
}
