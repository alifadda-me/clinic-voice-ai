export type * from './clinic/repositories.js';
export type * from './platform/calendar-gateway.js';
export {
  CalendarSlotUnavailableError,
  CalendarReservationNotFoundError,
  CalendarConfigurationError,
  CalendarUnavailableError,
  CalendarOperationFailedError,
} from './platform/calendar-gateway.js';
export type * from './platform/working-memory.js';
export {
  WorkingMemorySessionNotFoundError,
  WorkingMemoryUnavailableError,
  WorkingMemoryCorruptedError,
} from './platform/working-memory.js';
export type * from './platform/knowledge-graph.js';
export { KnowledgeGraphUnavailableError } from './platform/knowledge-graph.js';
export type * from './platform/semantic-search.js';
export {
  SemanticSearchUnavailableError,
  EmbeddingUnavailableError,
} from './platform/semantic-search.js';
export type * from './platform/embedding-provider.js';
export type * from './platform/chat-model.js';
export {
  ChatModelUnavailableError,
  ChatModelInvalidResponseError,
} from './platform/chat-model.js';
export type * from './platform/auth.js';
export type * from './clinic/principal-patient.js';
export type * from './platform/live-voice-provider.js';
export { LiveVoiceUnavailableError } from './platform/live-voice-provider.js';
export type * from './platform/observability.js';
export type * from './platform/time.js';
