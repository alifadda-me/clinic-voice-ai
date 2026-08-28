# Clinic Voice AI — Engineering Instructions

## 1. Project Mission

We are building a production-grade, real-time conversational AI assistant for clinic appointment management.

The system should support:

- Real-time voice conversations
- Text conversations
- User onboarding
- Patient profile management
- Patient preferences
- Doctor and specialty discovery
- Appointment availability
- Appointment booking
- Appointment rescheduling
- Appointment cancellation
- Multi-turn conversational context
- Long-term user memory
- Semantic retrieval
- Knowledge graph relationships
- Calendar integration
- Observability
- Automated evaluation
- Regression testing

The system must be designed as a reusable AI-agent platform rather than a tightly coupled clinic application.

The clinic domain is an application/domain implementation on top of the platform.

---

# 2. Most Important Engineering Principle

## LOW COUPLING + HIGH COHESION

Every architectural and implementation decision MUST optimize for:

- Low coupling
- High cohesion
- SOLID principles
- Separation of concerns
- Dependency inversion
- Explicit boundaries
- Replaceable infrastructure
- Domain/business isolation
- Testability
- Extensibility

The codebase must make it easy to:

- Replace PostgreSQL
- Replace Redis
- Replace Neo4j
- Replace Qdrant
- Replace Google Calendar
- Replace Gemini
- Replace LangGraph
- Replace Opik
- Replace the voice provider
- Add another domain
- Add another communication channel
- Add another calendar provider

without rewriting business logic.

---

# 3. DOMAIN/BUSINESS ISOLATION

This is a NON-NEGOTIABLE requirement.

Business/domain logic MUST NOT depend directly on:

- PostgreSQL
- Drizzle
- Redis
- Neo4j
- Qdrant
- Google Calendar
- Gemini
- LangChain
- LangGraph
- Opik
- Express
- WebSockets
- Twilio
- HTTP
- environment variables
- provider-specific SDKs

The domain layer should contain business concepts and business rules.

It should NOT know how those concepts are persisted, retrieved, transmitted, traced, or scheduled.

Bad:

```ts
import { db } from "@/infrastructure/database";
import { users } from "@/infrastructure/database/schema";

export async function bookAppointment(...) {
  await db.insert(...);
}


Good:

export interface AppointmentRepository {
  create(appointment: Appointment): Promise<Appointment>;
}


Then infrastructure implements the interface:

export class PostgresAppointmentRepository
  implements AppointmentRepository {
  // PostgreSQL implementation
}

```


Business logic depends on the interface.

Infrastructure depends on the interface.

Neither should leak implementation details across the boundary.

4. Architecture Philosophy

Use a layered/hexagonal architecture with strong dependency boundaries.

Preferred conceptual structure:

                    ┌─────────────────────┐
                    │     Interfaces      │
                    │ Voice / Chat / HTTP │
                    └──────────┬──────────┘
                               │
                               ▼
                    ┌─────────────────────┐
                    │   Application Layer │
                    │   Use Cases / Flow  │
                    └──────────┬──────────┘
                               │
                               ▼
                    ┌─────────────────────┐
                    │    Domain Layer     │
                    │ Entities / Rules    │
                    └──────────┬──────────┘
                               │
                         Ports / Interfaces
                               │
             ┌─────────────────┼─────────────────┐
             ▼                 ▼                 ▼
      ┌────────────┐    ┌────────────┐    ┌────────────┐
      │ PostgreSQL │    │   Qdrant   │    │   Neo4j    │
      └────────────┘    └────────────┘    └────────────┘

             ┌─────────────────┼─────────────────┐
             ▼                 ▼                 ▼
      ┌────────────┐    ┌────────────┐    ┌────────────┐
      │  Calendar  │    │    LLM     │    │    Voice   │
      └────────────┘    └────────────┘    └────────────┘


The dependency direction should always point inward.

Infrastructure → Application → Domain
Interface      → Application


Never:

Domain → PostgreSQL
Domain → Gemini
Domain → Qdrant
Domain → Google Calendar

5. Recommended Project Structure

Prefer a structure similar to:

src/
├── domain/
│   ├── patient/
│   ├── doctor/
│   ├── specialty/
│   ├── appointment/
│   ├── preference/
│   └── shared/
│
├── application/
│   ├── patient/
│   ├── doctor/
│   ├── appointment/
│   ├── search/
│   ├── identity/
│   └── graph/
│
├── ports/
│   ├── clinic/
│   └── platform/
│
├── infrastructure/
│   ├── database/postgres/
│   ├── memory/redis/
│   ├── vector/qdrant/
│   ├── graph/neo4j/
│   ├── calendar/google/
│   ├── llm/openrouter/
│   ├── auth/
│   ├── voice/gemini-live/
│   ├── telephony/twilio/
│   └── observability/opik/
│
├── interfaces/
│   ├── http/
│   ├── voice/
│   └── telephony/
│
├── agent/
│   ├── tools/
│   └── …
│
├── runtime/          # production bootstrap & use-case wiring
├── config/
├── server.ts
└── bin/


This structure is a starting point, not a rigid requirement.

Prefer organizing code around cohesive responsibilities rather than creating folders simply because they sound architectural.

6. Domain Layer

The domain layer contains:

Entities
Value objects
Domain services
Business rules
Domain errors
Domain events where useful
Repository interfaces
Provider-independent contracts

Examples:

Patient
Doctor
Specialty
Appointment
AppointmentStatus
PatientPreference
TimeSlot


The domain should use domain language.

Avoid infrastructure terminology.

Bad:

QdrantPropertyRecord
Neo4jPatientNode
PostgresAppointment
GeminiPatient


Good:

Patient
Doctor
Appointment
AppointmentSlot
PatientPreference

7. Application Layer

The application layer coordinates use cases.

Examples:

RegisterPatient
GetPatientProfile
FindDoctors
SearchDoctors
GetAvailableAppointments
BookAppointment
CancelAppointment
RescheduleAppointment
SavePatientPreference
GetPatientContext


Application services should:

Coordinate domain objects
Call repository interfaces
Call external service interfaces
Manage transaction boundaries where necessary
Return application-level results

Application services should NOT contain:

SQL
Cypher
Qdrant filters
Redis commands
HTTP request handling
Gemini SDK calls
Google Calendar SDK calls
8. Infrastructure Layer

Infrastructure contains implementation details.

Examples:

PostgresPatientRepository
PostgresAppointmentRepository
RedisConversationMemory
Neo4jPatientKnowledgeGraph
QdrantDoctorSearch
GoogleCalendarAppointmentScheduler
GeminiLiveVoiceProvider
OpikObservabilityProvider


Infrastructure adapters implement interfaces defined by the inner layers.

Infrastructure code may know about:

SDKs
SQL
Cypher
HTTP
WebSockets
provider-specific APIs
serialization
connection pooling
retries
provider-specific errors

But these details must not leak into domain logic.

9. Dependency Inversion

Use dependency inversion aggressively.

Define ports/interfaces at the boundary where they are consumed.

Example:

export interface CalendarGateway {
  getAvailableSlots(
    doctorId: DoctorId,
    range: DateRange,
  ): Promise<TimeSlot[]>;

  bookSlot(
    appointment: Appointment,
  ): Promise<BookingConfirmation>;
}


The application depends on CalendarGateway.

Google Calendar becomes one adapter:

export class GoogleCalendarGateway implements CalendarGateway {
}


Later:

export class MicrosoftCalendarGateway implements CalendarGateway {
}


No application logic should change.

10. Never Leak Provider Types

Do not allow provider-specific types to cross architectural boundaries.

Bad:

function book(
  event: GoogleCalendarEvent
) {}


Good:

function book(
  appointment: Appointment
) {}


The infrastructure adapter converts:

Domain Appointment
       ↓
GoogleCalendarGateway
       ↓
GoogleCalendarEvent

11. AI/LLM Isolation

LLM providers must be abstracted.

Do not spread Gemini/LangChain-specific types throughout the application.

Prefer:

interface ChatModel {
  generate(request: ChatRequest): Promise<ChatResponse>;
}


Then:

GeminiChatModel
OpenRouterChatModel
GroqChatModel


implement the interface.

The domain must never know which LLM is being used.

12. Voice Isolation

Voice infrastructure should be isolated from the application/business logic.

The application should deal with concepts such as:

Conversation
ConversationTurn
UserMessage
AssistantMessage
AudioSession


It should not care whether audio arrived through:

Gemini Live
Twilio
WebRTC
WebSocket
another provider

Voice adapters translate provider-specific events into internal application events.

13. Agent Architecture

The agent is an orchestration mechanism, not the business layer.

The LLM should NOT directly implement business rules.

The agent should:

Understand user intent
Decide which tool/use case is appropriate
Extract parameters
Maintain conversational context
Ask clarification questions
Call application-level capabilities
Present results naturally

Business rules should live below the agent.

For example:

Bad:

LLM decides whether appointment can be booked.


Good:

LLM
 ↓
bookAppointment tool
 ↓
Application Use Case
 ↓
Domain Rules
 ↓
Calendar Port
 ↓
Calendar Adapter


The LLM proposes an action.

The application decides whether the action is valid.

14. Agent Tools

Tools should be thin adapters around application use cases.

Bad:

const bookAppointmentTool = async () => {
  // SQL
  // Neo4j
  // Google Calendar
  // business rules
  // formatting
  // everything
};


Good:

const bookAppointmentTool = createTool({
  name: "book_appointment",
  execute: async (input) => {
    return bookAppointment.execute(input);
  },
});


Tools translate between:

LLM Tool Input
      ↓
Application Input
      ↓
Use Case
      ↓
Domain

15. Memory Architecture

Memory is a platform capability, not a business-specific implementation.

Separate memory concepts from storage technologies.

For example:

interface WorkingMemory {
  get(sessionId: string): Promise<ConversationContext>;
  append(sessionId: string, message: Message): Promise<void>;
}


Implementations:

RedisWorkingMemory


Similarly:

interface UserProfileRepository
interface PreferenceStore
interface SemanticSearch
interface KnowledgeGraph


Do not expose Redis, Neo4j, or Qdrant APIs outside infrastructure.

16. Memory Responsibilities

Use each storage technology for a clearly defined responsibility.

PostgreSQL

Persistent structured data:

Patients
Doctors
Appointments
Core user profile
Transactional state
Redis

Short-lived working state:

Session memory
Recent conversation turns
Temporary state
TTL-based data
Qdrant

Semantic retrieval:

Doctor descriptions
Clinic services
Specialties
Searchable knowledge
Other semantically searchable content
Neo4j

Long-term relationships:

Patient
   ↓ prefers
Specialty

Patient
   ↓ prefers
Morning

Patient
   ↓ previously_visited
Doctor

Doctor
   ↓ specializes_in
Specialty


Do not duplicate responsibility unnecessarily.

17. Healthcare Domain Boundary

The clinic application must be administrative.

The system should focus on:

Appointment scheduling
Doctor discovery
Specialty discovery
Patient profile
Preferences
Booking
Cancellation
Rescheduling
Clinic information

Avoid implementing:

Diagnosis
Medical treatment recommendations
Medication recommendations
Clinical decision-making

The AI should not become the medical authority.

18. Data Modeling

Use explicit domain models.

Do not use raw database records throughout the application.

Bad:

type Patient = typeof patients.$inferSelect;


Good:

type Patient = {
  id: PatientId;
  name: string;
  phoneNumber: PhoneNumber;
};


Then map:

Postgres Record
      ↓
Repository Mapper
      ↓
Domain Entity

19. Error Handling

Errors should be meaningful at the appropriate layer.

Domain errors:

AppointmentAlreadyBooked
InvalidAppointmentTransition
DoctorUnavailable
InvalidPatient


Infrastructure errors:

DatabaseConnectionError
CalendarProviderError
VectorDatabaseError
LLMProviderError


Do not leak infrastructure errors directly to users.

Translate them at the appropriate boundary.

20. Configuration

Never access environment variables throughout the codebase.

Bad:

process.env.GEMINI_API_KEY


inside random modules.

Instead:

Environment
   ↓
Config Loader
   ↓
Validated Config
   ↓
Dependency Composition
   ↓
Application


Configuration should be validated at startup.

21. Dependency Injection

Prefer explicit dependency injection.

Bad:

const service = new AppointmentService();


where the service internally creates repositories.

Good:

const service = new AppointmentService(
  appointmentRepository,
  calendarGateway,
  patientRepository,
);


Dependencies should be visible.

Avoid hidden global state.

22. Runtime Bootstrap

Provider implementations should be wired in one place (see `src/runtime/` and `src/server.ts`).

Example:

server.ts
    ↓
createProductionRuntime()
    ↓
infrastructure adapters + use cases + interfaces


The rest of the application should not construct infrastructure dependencies itself.

23. SOLID

Apply SOLID pragmatically.

Single Responsibility

A module should have one clear reason to change.

Open/Closed

Prefer extending through interfaces/adapters instead of modifying business logic for every provider.

Liskov Substitution

Implementations of an interface must honor the same behavioral contract.

Interface Segregation

Prefer small focused interfaces.

Bad:

interface MegaRepository {
  savePatient();
  searchDoctor();
  bookAppointment();
  getCalendar();
  saveMemory();
  searchVector();
}


Good:

PatientRepository
DoctorRepository
AppointmentRepository
CalendarGateway
SemanticSearch
WorkingMemory

Dependency Inversion

High-level business logic depends on abstractions, not infrastructure.

24. Avoid Overengineering

Do NOT create abstractions merely for the sake of abstraction.

Create an interface when:

There is a provider boundary
The dependency should be replaceable
The dependency should be mocked
The dependency represents an external capability
The abstraction protects the domain/application layer

Do not create:

IUserServiceFactoryProviderManager


just because "SOLID".

Prefer simple, meaningful abstractions.

25. Testing

Tests should follow architectural boundaries.

Prioritize:

Domain tests

Pure unit tests.

No database.

No network.

No LLM.

Application tests

Mock ports/interfaces.

Verify use-case behavior.

Infrastructure tests

Verify adapters against real infrastructure where useful.

Agent evaluation

Test:

Intent detection
Tool selection
Tool arguments
Multi-turn context
Safety behavior
Failure handling
Appointment flows
Regression dataset

Maintain a golden dataset for important scenarios.

Every major behavioral change should be evaluated against it.

26. Observability

Observability must be provider-independent from the application's perspective.

Track:

Request latency
LLM latency
TTFA
Tool latency
Retrieval latency
Calendar latency
Error rates
Token usage
Cost
Agent traces
Evaluation results

Opik is an infrastructure adapter, not an application dependency.

27. Performance

Optimize only after measuring.

Important metrics:

TTFA
p50 latency
p90 latency
p95 latency
End-to-end latency
Tool latency
Retrieval latency
Error rate

Avoid premature optimization.

Use caching when it provides measurable value.

Redis should not become a dumping ground for arbitrary state.

28. Security

Never:

Hardcode secrets
Log API keys
Log sensitive patient information unnecessarily
Trust LLM-generated identifiers
Trust LLM-generated authorization decisions
Allow the LLM to bypass business rules

Validate all tool inputs.

Use schemas at boundaries.

29. Schema Validation

Validate external inputs.

Use Zod or equivalent validation for:

HTTP input
WebSocket messages
Tool arguments
Configuration
External API responses where appropriate

Never assume LLM-generated arguments are valid.

30. Naming

Use business/domain language inside business layers.

Use technical language inside infrastructure.

Good:

Appointment
Patient
Doctor
BookAppointment
FindDoctors


Infrastructure:

PostgresAppointmentRepository
Neo4jPatientGraph
QdrantSemanticSearch
GoogleCalendarGateway


Avoid mixing both:

Neo4jAppointmentService
GeminiPatientManager
RedisBookingService

31. No Copy-Paste Architecture

Prior tightly coupled voice applications are reference material only.

We are NOT blindly copying their:

Folder structure
Domain models
Naming
Tool definitions
Agent prompts
Database schema
Architecture decisions
Coupling patterns

Extract useful architectural ideas and redesign them properly.
Whenever a reference contains domain-specific coupling, improve the boundary instead of reproducing it.

32. Refactoring Rule

When touching existing code:

Do not perform unrelated refactors.

But if a change would introduce strong coupling, stop and redesign the boundary first.

Prefer:

Small change
   ↓
Identify boundary
   ↓
Define interface
   ↓
Implement adapter
   ↓
Connect use case


over:

Add another import
Add another conditional
Add another provider-specific branch

33. Provider Switching

The architecture should make these possible:

Gemini → OpenRouter
Qdrant → another vector database
Neo4j → another graph store
Google Calendar → Microsoft Calendar
Redis → another cache
PostgreSQL → another relational database
Twilio → WebRTC
Gemini Live → another voice provider
Opik → another observability provider


without changing domain logic.

34. Domain Portability

The long-term goal is that the same platform can support:

Clinic
Recruiting
Travel
E-commerce
Real Estate
Other appointment-based domains


The platform layer should provide reusable capabilities:

Voice
Chat
Agent Orchestration
Memory
Semantic Search
Scheduling
Tool Execution
Observability
Evaluation


The domain layer provides:

Patients
Doctors
Appointments
Specialties
Clinic Rules


This distinction must remain explicit.

35. Decision Rule

Before adding a dependency to a module, ask:

Is this business logic?
Is this application orchestration?
Is this infrastructure?
Is this an external interface?
Does this dependency cross a boundary?
Can this dependency be replaced?
Can this code be tested without the provider?
Does this module have one clear responsibility?

If the answer reveals unnecessary coupling, redesign before implementing.

36. Golden Rule

When choosing between:

Fast implementation


and:

Clean boundary


prefer the clean boundary unless the additional complexity is clearly unjustified.

We are building a system that should remain maintainable after the initial implementation.

The objective is not merely:

"make it work."

The objective is:

"make it work while preserving architectural boundaries."

37. Implementation Workflow

For every feature:

Define the business requirement.
Identify the domain concepts.
Define domain rules.
Define application use cases.
Define required ports/interfaces.
Implement infrastructure adapters.
Implement agent tools if required.
Connect interfaces through dependency injection.
Add tests.
Add observability.
Add evaluation scenarios.
Measure performance.
Review coupling before considering the feature complete.

Do not start by writing infrastructure code.

Start from the business capability and work outward.

38. Code Review Checklist

Before considering code complete, verify:

 Low coupling
 High cohesion
 SOLID principles respected
 Domain isolated from infrastructure
 Business rules not inside controllers
 Business rules not inside LLM prompts
 Business rules not inside infrastructure adapters
 Provider-specific types do not leak
 Dependencies are explicit
 External input is validated
 Errors are translated appropriately
 Tests exist at the correct boundary
 Observability exists for important flows
 No unnecessary abstraction
 No unnecessary duplication
 No hidden global state
 No hardcoded secrets
 No unrelated refactoring
 Domain terminology is consistent
39. Final Principle

The most important architectural rule in this project is:

BUSINESS LOGIC MUST BE ABLE TO SURVIVE THE REPLACEMENT OF THE TECHNOLOGY STACK.

If PostgreSQL, Redis, Neo4j, Qdrant, Gemini, LangGraph, Google Calendar, Twilio, or Opik disappeared tomorrow, the core business/domain model should still make sense.

Technology is an implementation detail.

The domain is the center of the system.

