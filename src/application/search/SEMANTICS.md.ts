/**
 * Semantic search — application semantics
 * =======================================
 *
 * Port: SemanticSearch + EmbeddingProvider (provider-neutral).
 *
 * Explicit rebuild use cases:
 *   RebuildDoctorSearchIndex / RebuildSpecialtySearchIndex
 *   read DoctorRepository + SpecialtyRepository (SoT)
 *   write SemanticSearch only
 *
 * Search returns candidate ids + scores. Eligibility after hydrate from Postgres.
 * Availability is a separate concern (GetAvailableAppointments).
 */

export {};
