import { randomUUID } from 'node:crypto';
import type { AuthCredentials, AuthGateway } from '../../ports/platform/auth.js';
import { InvalidAuthCredentialsError } from '../../ports/platform/auth.js';
import type { LiveVoiceProvider, LiveVoiceSession } from '../../ports/platform/live-voice-provider.js';
import { LiveVoiceUnavailableError } from '../../ports/platform/live-voice-provider.js';
import type { WorkingMemory } from '../../ports/platform/working-memory.js';
import type { ObservabilityPort } from '../../ports/platform/observability.js';
import type { ResolveClinicActor } from '../../application/identity/resolve-clinic-actor.js';
import {
  createTrustedExecutionContext,
  type TrustedExecutionContext,
} from '../../agent/execution-context.js';
import type { ToolRegistry } from '../../agent/tools/types.js';
import { CLINIC_AGENT_SYSTEM_INSTRUCTION } from '../../agent/prompts.js';
import { createSafeObservability } from '../../agent/safe-observability.js';

export type StartVoiceClinicSessionInput = {
  /** Conversation / WorkingMemory correlation — not authentication. */
  conversationId: string;
  /** Same credential shape as HTTP chat (Bearer / demo). */
  credentials?: AuthCredentials | undefined;
  requestCorrelationId?: string | undefined;
  /** Defaults to voice; Twilio PSTN uses twilio_voice. */
  channel?: 'voice' | 'twilio_voice' | undefined;
};

export type VoiceClinicSessionResult = {
  session: LiveVoiceSession;
  /** Frozen for the lifetime of this voice session. */
  execution: TrustedExecutionContext;
};

/**
 * Voice interface over the shared trust path.
 *
 *   credentials → AuthGateway → principal
 *        ↓
 *   ResolveClinicActor → TrustedExecutionContext (channel: voice)
 *        ↓
 *   LiveVoiceProvider → ToolRegistry → Application
 *
 * Does not invent patient identity. conversationId ≠ auth.
 */
export class VoiceClinicSession {
  private readonly observability: ObservabilityPort;

  constructor(
    private readonly deps: {
      voiceProvider: LiveVoiceProvider;
      authGateway: AuthGateway;
      resolveClinicActor: ResolveClinicActor;
      tools: ToolRegistry;
      workingMemory: WorkingMemory;
      observability?: ObservabilityPort | undefined;
    },
  ) {
    this.observability = createSafeObservability(deps.observability);
  }

  async start(
    input: StartVoiceClinicSessionInput,
  ): Promise<VoiceClinicSessionResult> {
    const sessionSpan = this.observability.startTrace('voice.session', {
      channel: input.channel ?? 'voice',
      conversation_id: input.conversationId,
    });
    const startedAt = Date.now();

    try {
      const principal = await this.deps.authGateway.resolve(
        input.credentials ?? {},
      );
      const { actor } = await this.deps.resolveClinicActor.execute({
        principal,
      });

      const execution = createTrustedExecutionContext({
        conversationId: input.conversationId,
        principal,
        actor,
        channel: input.channel ?? 'voice',
        requestCorrelationId:
          input.requestCorrelationId?.trim() || randomUUID(),
      });

      sessionSpan.setAttribute('authenticated', Boolean(actor));

      const existing = await this.deps.workingMemory.getSession(
        input.conversationId,
      );
      if (!existing) {
        await this.deps.workingMemory.createSession(input.conversationId);
      }

      const definitions = this.deps.tools.listDefinitions();
      const session = await this.deps.voiceProvider.startSession({
        sessionId: input.conversationId,
        systemInstruction: buildVoiceSystemInstruction(execution),
        tools: definitions.map((d) => ({
          name: d.name,
          description: d.description,
          parametersSchema: d.parameters,
        })),
        handlers: {
          onTranscript: (text, role) => {
            void this.appendTranscript(input.conversationId, text, role);
          },
          onToolCall: async (call) => {
            const toolSpan = sessionSpan.startChild('voice.tool.dispatch', {
              tool_name: call.name,
            });
            const toolStarted = Date.now();
            try {
              // Same frozen execution for every tool in the voice session.
              const result = await this.deps.tools.dispatch(
                call.name,
                call.arguments,
                { execution },
              );
              toolSpan.setAttribute('tool_ok', result.ok);
              toolSpan.setAttribute('latency_ms', Date.now() - toolStarted);
              if (
                !result.ok &&
                'code' in result &&
                typeof result.code === 'string'
              ) {
                toolSpan.setAttribute('error_code', result.code);
              }
              toolSpan.end();
              return JSON.stringify(result);
            } catch (error) {
              toolSpan.setAttribute('tool_ok', false);
              toolSpan.setAttribute('latency_ms', Date.now() - toolStarted);
              toolSpan.setAttribute(
                'error_code',
                error instanceof Error ? error.name : 'TOOL_ERROR',
              );
              toolSpan.end();
              return JSON.stringify({
                ok: false,
                code: 'TOOL_ERROR',
                message: 'Tool execution failed',
              });
            }
          },
          onError: (error) => {
            sessionSpan.setAttribute(
              'error_code',
              error instanceof LiveVoiceUnavailableError
                ? error.code
                : error.name,
            );
            void this.observability.recordEvent('voice.error', {
              error_code:
                error instanceof LiveVoiceUnavailableError
                  ? error.code
                  : error.name,
            });
          },
          onClose: () => {
            sessionSpan.setAttribute('latency_ms', Date.now() - startedAt);
            sessionSpan.setAttribute('status', 'closed');
            sessionSpan.end();
            void this.observability.recordEvent('voice.session.close', {
              conversation_id: input.conversationId,
            });
          },
        },
      });

      sessionSpan.setAttribute('status', 'started');
      sessionSpan.setAttribute('start_latency_ms', Date.now() - startedAt);
      return { session, execution };
    } catch (error) {
      sessionSpan.setAttribute('status', 'error');
      sessionSpan.setAttribute('latency_ms', Date.now() - startedAt);
      if (error instanceof InvalidAuthCredentialsError) {
        sessionSpan.setAttribute('error_code', error.code);
        sessionSpan.end();
        throw error;
      }
      if (error instanceof LiveVoiceUnavailableError) {
        sessionSpan.setAttribute('error_code', error.code);
        sessionSpan.end();
        throw error;
      }
      sessionSpan.setAttribute(
        'error_code',
        error instanceof Error ? error.name : 'VOICE_START_FAILED',
      );
      sessionSpan.end();
      throw new LiveVoiceUnavailableError(
        error instanceof Error ? error.message : 'Voice session failed',
      );
    }
  }

  private async appendTranscript(
    conversationId: string,
    text: string,
    role: 'user' | 'assistant',
  ): Promise<void> {
    try {
      const trimmed = text.trim();
      if (!trimmed) return;
      await this.deps.workingMemory.appendTurn(conversationId, {
        role,
        content: trimmed,
        at: new Date(),
      });
    } catch {
      /* WorkingMemory failure must not kill the voice session */
    }
  }
}

function buildVoiceSystemInstruction(execution: TrustedExecutionContext): string {
  const status = execution.actor
    ? 'Auth status: an authenticated clinic patient is linked for this voice session. Do not ask them to authenticate again unless a tool reports PATIENT_NOT_IDENTIFIED.'
    : 'Auth status: anonymous (no authenticated clinic patient). Doctor/specialty search and availability are allowed. Profile, preferences, booking, cancel, and reschedule require authentication.';

  return `${CLINIC_AGENT_SYSTEM_INSTRUCTION}\n\n${status}`;
}
