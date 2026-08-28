/**
 * Session / conversation trust boundary
 * =====================================
 *
 * conversationId / sessionId = correlation for WorkingMemory and transcripts.
 * conversationId does NOT grant patient authority.
 *
 * Patient authority:
 *   credentials → AuthGateway → principal
 *        ↓
 *   ResolveClinicActor → TrustedExecutionContext.actor
 *        ↓
 *   tools / use cases (ownership checks)
 *
 * JwtBearerAuthGateway: missing Authorization → anonymous; invalid Bearer → 401.
 * DemoAuthGateway is local/evaluation only — refused by production runtime.
 *
 * register_patient does not authenticate or link principals.
 * LinkPrincipalToPatient / EnrollAuthenticatedPatient run outside the tool loop.
 */

export {};
