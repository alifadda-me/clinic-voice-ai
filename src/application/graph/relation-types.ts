/**
 * Application-owned relation type constants for the patient affinity graph.
 * Adapters map these opaque strings to provider edge types (e.g. Cypher).
 *
 * Path (SuggestDoctorsFromPeerAffinity):
 *   Patient -[:PREFERS]-> Specialty <-[:PREFERS]- Peer -[:VISITED]-> Doctor
 */
export const PREFERS = 'PREFERS';
export const VISITED = 'VISITED';
