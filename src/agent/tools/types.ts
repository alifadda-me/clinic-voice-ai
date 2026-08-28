import type { ChatToolDefinition } from '../../ports/platform/chat-model.js';
import type { TrustedExecutionContext } from '../execution-context.js';

export type ToolResult =
  | { ok: true; message: string }
  | { ok: false; code: string; message: string };

export type ToolExecutionContext = {
  /** Immutable trusted context for this agent turn — tools must not mutate it. */
  readonly execution: TrustedExecutionContext;
};

export type ClinicTool = {
  definition: ChatToolDefinition;
  /** When true, requires execution.actor.patientId (never from model). */
  requiresPatient?: boolean | undefined;
  execute(
    args: Record<string, unknown>,
    ctx: ToolExecutionContext,
  ): Promise<ToolResult>;
};

export type ToolRegistry = {
  listDefinitions(): ChatToolDefinition[];
  dispatch(
    name: string,
    args: Record<string, unknown>,
    ctx: ToolExecutionContext,
  ): Promise<ToolResult>;
};
