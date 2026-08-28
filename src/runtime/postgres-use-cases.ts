import { loadPostgresConfig } from '../config/postgres.js';
import { loadGoogleCalendarConfig } from '../config/google-calendar.js';
import { createPostgresInfrastructure } from '../infrastructure/database/postgres/index.js';
import { createGoogleCalendarGateway } from '../infrastructure/calendar/google/index.js';
import {
  BookAppointment,
  CancelAppointment,
  CompleteAppointment,
  FindDoctors,
  GetAvailableAppointments,
  GetPatientContext,
  GetPatientProfile,
  RegisterPatient,
  RescheduleAppointment,
  SavePatientPreference,
  SearchDoctors,
  SearchSpecialties,
  RebuildDoctorSearchIndex,
  RebuildSpecialtySearchIndex,
  RebuildPatientAffinityGraph,
  SuggestDoctorsFromPeerAffinity,
} from '../application/index.js';
import type { CalendarGateway } from '../ports/platform/calendar-gateway.js';
import type { EmbeddingProvider } from '../ports/platform/embedding-provider.js';
import type { KnowledgeGraph } from '../ports/platform/knowledge-graph.js';
import type { SemanticSearch } from '../ports/platform/semantic-search.js';

/**
 * Wire Postgres repositories + injectable calendar/search/graph into use cases.
 * Pass an explicit CalendarGateway, or omit to build Google from env.
 * KnowledgeGraph is optional — when provided, peer-affinity use cases wire in.
 * Search indexes / affinity graph are disposable; rebuild via Rebuild* use cases.
 */
export function createPostgresBackedUseCases(deps: {
  calendar?: CalendarGateway;
  embeddings: EmbeddingProvider;
  semanticSearch: SemanticSearch;
  knowledgeGraph?: KnowledgeGraph;
  env?: NodeJS.ProcessEnv;
}) {
  const env = deps.env ?? process.env;
  const config = loadPostgresConfig(env);
  const infra = createPostgresInfrastructure(config);
  const { repositories: repos, clock, ids } = infra;

  const calendar =
    deps.calendar ??
    (() => {
      const google = loadGoogleCalendarConfig(env);
      return createGoogleCalendarGateway({
        credentials: {
          serviceAccountEmail: google.serviceAccountEmail,
          privateKey: google.privateKey,
        },
        config: {
          timeZone: google.timeZone,
          defaultCalendarId: google.defaultCalendarId,
        },
      });
    })();

  return {
    infra,
    calendar,
    useCases: {
      registerPatient: new RegisterPatient(repos.patients, ids, clock),
      getPatientProfile: new GetPatientProfile(repos.patients),
      savePatientPreference: new SavePatientPreference(
        repos.patients,
        repos.preferences,
        repos.specialties,
        repos.doctors,
        ids,
        clock,
      ),
      getPatientContext: new GetPatientContext(
        repos.patients,
        repos.preferences,
        repos.appointments,
      ),
      findDoctors: new FindDoctors(repos.doctors),
      searchDoctors: new SearchDoctors(
        repos.doctors,
        deps.semanticSearch,
        deps.embeddings,
      ),
      searchSpecialties: new SearchSpecialties(
        repos.specialties,
        deps.semanticSearch,
        deps.embeddings,
      ),
      rebuildDoctorSearchIndex: new RebuildDoctorSearchIndex(
        repos.doctors,
        repos.specialties,
        deps.semanticSearch,
        deps.embeddings,
      ),
      rebuildSpecialtySearchIndex: new RebuildSpecialtySearchIndex(
        repos.specialties,
        deps.semanticSearch,
        deps.embeddings,
      ),
      ...(deps.knowledgeGraph
        ? {
            rebuildPatientAffinityGraph: new RebuildPatientAffinityGraph(
              repos.preferences,
              repos.appointments,
              deps.knowledgeGraph,
            ),
            suggestDoctorsFromPeerAffinity: new SuggestDoctorsFromPeerAffinity(
              repos.patients,
              repos.doctors,
              deps.knowledgeGraph,
            ),
          }
        : {}),
      getAvailableAppointments: new GetAvailableAppointments(
        repos.doctors,
        calendar,
        clock,
      ),
      bookAppointment: new BookAppointment(
        repos.patients,
        repos.doctors,
        repos.appointments,
        calendar,
        ids,
        clock,
      ),
      cancelAppointment: new CancelAppointment(
        repos.appointments,
        calendar,
        clock,
      ),
      rescheduleAppointment: new RescheduleAppointment(
        repos.appointments,
        repos.doctors,
        calendar,
        clock,
      ),
      completeAppointment: new CompleteAppointment(repos.appointments, clock),
    },
  };
}
