import type { ClinicTool, ToolRegistry, ToolExecutionContext, ToolResult } from './types.js';
import { formatToolError, patientRequiredResult } from './format-error.js';

/** Fields the model must never control — execution context is authoritative. */
const UNTRUSTED_IDENTITY_KEYS = [
  'patientId',
  'subjectId',
  'userId',
  'sessionId',
  'conversationId',
  'authenticatedPatientId',
  'principalId',
  'actor',
] as const;

export function stripUntrustedIdentityArgs(
  args: Record<string, unknown>,
): Record<string, unknown> {
  const safeArgs = { ...args };
  for (const key of UNTRUSTED_IDENTITY_KEYS) {
    delete safeArgs[key];
  }
  return safeArgs;
}

export function createToolRegistry(tools: ClinicTool[]): ToolRegistry {
  const byName = new Map(tools.map((t) => [t.definition.name, t]));

  return {
    listDefinitions() {
      return tools.map((t) => t.definition);
    },

    async dispatch(
      name: string,
      args: Record<string, unknown>,
      ctx: ToolExecutionContext,
    ): Promise<ToolResult> {
      const tool = byName.get(name);
      if (!tool) {
        return {
          ok: false,
          code: 'UNKNOWN_TOOL',
          message: `Unknown tool '${name}'`,
        };
      }

      if (tool.requiresPatient && !ctx.execution.actor?.patientId) {
        return patientRequiredResult();
      }

      const safeArgs = stripUntrustedIdentityArgs(args);

      try {
        return await tool.execute(safeArgs, ctx);
      } catch (error) {
        return formatToolError(error);
      }
    },
  };
}
