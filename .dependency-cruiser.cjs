/** @type {import('dependency-cruiser').IConfiguration} */
module.exports = {
  forbidden: [
    {
      name: 'domain-no-outward',
      comment:
        'Domain must not depend on application, infrastructure, agent, interfaces, or runtime.',
      severity: 'error',
      from: { path: '^src/domain' },
      to: {
        path: '^src/(application|infrastructure|agent|interfaces|runtime)',
      },
    },
    {
      name: 'domain-no-ports',
      comment:
        'Domain must not import ports. Ports are consumed by application; domain owns pure types only.',
      severity: 'error',
      from: { path: '^src/domain' },
      to: { path: '^src/ports' },
    },
    {
      name: 'application-no-infrastructure',
      comment:
        'Application depends on ports and domain only — never infrastructure adapters or DB clients.',
      severity: 'error',
      from: { path: '^src/application' },
      to: { path: '^src/infrastructure' },
    },
    {
      name: 'application-no-framework-entrypoints',
      comment: 'Application must not import Express/HTTP/voice gateways.',
      severity: 'error',
      from: { path: '^src/application' },
      to: { path: '^src/(agent|interfaces)' },
    },
    {
      name: 'application-no-runtime',
      comment:
        'Application must not import the production runtime bootstrap.',
      severity: 'error',
      from: { path: '^src/application' },
      to: { path: '^src/runtime' },
    },
    {
      name: 'ports-are-contracts-only',
      comment: 'Port definitions must not depend on application or infrastructure.',
      severity: 'error',
      from: { path: '^src/ports' },
      to: { path: '^src/(application|infrastructure|agent|interfaces|runtime)' },
    },
    {
      name: 'agent-no-infrastructure',
      comment:
        'Agent orchestrates tools/use cases; it must not import infrastructure adapters or SDKs.',
      severity: 'error',
      from: { path: '^src/agent' },
      to: { path: '^src/infrastructure' },
    },
    {
      name: 'agent-no-runtime',
      comment: 'Agent must not import the production runtime bootstrap.',
      severity: 'error',
      from: { path: '^src/agent' },
      to: { path: '^src/runtime' },
    },
    {
      name: 'agent-no-auth-adapters',
      comment: 'Agent must not import auth adapters or parse credentials/headers.',
      severity: 'error',
      from: { path: '^src/agent' },
      to: { path: '^src/infrastructure/auth' },
    },
    {
      name: 'application-no-auth-adapters',
      comment: 'Application must not import auth infrastructure adapters.',
      severity: 'error',
      from: { path: '^src/application' },
      to: { path: '^src/infrastructure/auth' },
    },
    {
      name: 'domain-no-auth-ports',
      comment: 'Domain must not know authentication concepts or AuthGateway.',
      severity: 'error',
      from: { path: '^src/domain' },
      to: { path: '^src/ports/platform/auth' },
    },
    {
      name: 'interfaces-no-llm-adapters',
      comment:
        'HTTP interfaces depend on agent/ports via DI — not OpenRouter adapters directly.',
      severity: 'error',
      from: { path: '^src/interfaces' },
      to: { path: '^src/infrastructure/llm' },
    },
    {
      name: 'core-no-openrouter-adapter',
      comment:
        'Domain, application, ports, and agent must not import the OpenRouter adapter.',
      severity: 'error',
      from: { path: '^src/(domain|application|ports|agent)' },
      to: { path: '^src/infrastructure/llm/openrouter' },
    },
    {
      name: 'express-only-in-http-interfaces',
      comment: 'express may only be imported from the HTTP interface layer.',
      severity: 'error',
      from: {
        path: '^src',
        pathNot: '^src/interfaces/http/',
      },
      to: { path: 'node_modules/express' },
    },
    {
      name: 'googleapis-only-in-google-calendar-adapter',
      comment:
        'googleapis may only be imported from the Google Calendar infrastructure adapter.',
      severity: 'error',
      from: {
        path: '^src',
        pathNot: '^src/infrastructure/calendar/google/',
      },
      to: { path: 'node_modules/googleapis' },
    },
    {
      name: 'ioredis-only-in-redis-working-memory-adapter',
      comment:
        'ioredis may only be imported from the Redis WorkingMemory infrastructure adapter.',
      severity: 'error',
      from: {
        path: '^src',
        pathNot: '^src/infrastructure/memory/redis/',
      },
      to: { path: 'node_modules/ioredis' },
    },
    {
      name: 'twilio-sdk-only-in-twilio-adapter',
      comment:
        'twilio package may only be imported from infrastructure/telephony/twilio.',
      severity: 'error',
      from: {
        path: '^src',
        pathNot: '^src/infrastructure/telephony/twilio/',
      },
      to: { path: 'node_modules/twilio' },
    },
    {
      name: 'google-genai-only-in-gemini-live-adapter',
      comment:
        '@google/genai may only be imported from infrastructure/voice/gemini-live.',
      severity: 'error',
      from: {
        path: '^src',
        pathNot: '^src/infrastructure/voice/gemini-live/',
      },
      to: { path: 'node_modules/@google/genai' },
    },
    {
      name: 'opik-sdk-only-in-opik-adapter',
      comment:
        'opik SDK may only be imported from infrastructure/observability/opik.',
      severity: 'error',
      from: {
        path: '^src',
        pathNot: '^src/infrastructure/observability/opik/',
      },
      to: { path: 'node_modules/opik' },
    },
    {
      name: 'jose-only-in-auth-adapters',
      comment:
        'jose (JWT/JWKS) may only be imported from infrastructure/auth.',
      severity: 'error',
      from: {
        path: '^src',
        pathNot: '^src/infrastructure/auth/',
      },
      to: { path: 'node_modules/jose' },
    },
    {
      name: 'qdrant-sdk-only-in-qdrant-adapter',
      comment:
        'Qdrant SDK may only be imported from infrastructure/vector/qdrant.',
      severity: 'error',
      from: {
        path: '^src',
        pathNot: '^src/infrastructure/vector/qdrant/',
      },
      to: { path: 'node_modules/@qdrant' },
    },
    {
      name: 'neo4j-driver-only-in-neo4j-adapter',
      comment:
        'neo4j-driver may only be imported from infrastructure/graph/neo4j.',
      severity: 'error',
      from: {
        path: '^src',
        pathNot: '^src/infrastructure/graph/neo4j/',
      },
      to: { path: 'node_modules/neo4j-driver' },
    },
    {
      name: 'no-provider-sdks-in-core',
      comment:
        'Domain, application, and ports must never import provider SDKs or frameworks.',
      severity: 'error',
      from: { path: '^src/(domain|application|ports)' },
      to: {
        path: 'node_modules/(@google|googleapis|@qdrant|neo4j-driver|ioredis|drizzle-orm|drizzle-kit|@langchain|langgraph|opik|twilio|express|ws|pg$|postgres|openai|jose)',
      },
    },
    {
      name: 'config-not-in-domain-application',
      comment: 'Validated config is for bootstrap/DI; domain/application receive deps via DI.',
      severity: 'error',
      from: { path: '^src/(domain|application)' },
      to: { path: '^src/config' },
    },
    {
      name: 'no-process-env-in-domain-or-application',
      comment:
        'Configuration must enter through runtime/bootstrap — not process.env in domain/application.',
      severity: 'error',
      from: { path: '^src/(domain|application)' },
      to: { path: 'node_modules/dotenv' },
    },
    {
      name: 'infrastructure-must-not-import-application',
      comment: 'Adapters implement ports; they must not call use cases.',
      severity: 'error',
      from: { path: '^src/infrastructure' },
      to: { path: '^src/application' },
    },
  ],
  options: {
    doNotFollow: { path: 'node_modules' },
    tsConfig: { fileName: 'tsconfig.json' },
    enhancedResolveOptions: {
      exportsFields: ['exports'],
      conditionNames: ['import', 'require', 'node', 'default'],
    },
  },
};
