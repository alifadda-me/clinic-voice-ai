/**
 * Clinic context + search boundaries
 * ==================================
 *
 * Application capabilities (ports underneath):
 *   - GetPatientContext (durable prefs + upcoming appointments from repos)
 *   - SearchDoctors / SearchSpecialties (natural-language discovery)
 *   - RebuildDoctorSearchIndex / RebuildSpecialtySearchIndex (derived projection)
 *   - FindDoctors (structured specialty/list via DoctorRepository)
 *   - SuggestDoctorsFromPeerAffinity (derived graph enrichment + PG hydrate)
 *
 * Preferences: PreferenceRepository is authoritative. Never move SoT to Neo4j.
 *
 * Store roles:
 *   PostgreSQL — clinic SoT
 *   Redis      — transient WorkingMemory
 *   Qdrant     — disposable semantic search
 *   Neo4j      — disposable relationship enrichment
 *
 * See docs/stores.md.
 */

export {};
