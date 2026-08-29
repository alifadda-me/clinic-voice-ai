/**
 * Coerce common LLM argument mistakes before Zod validation.
 * Voice models especially often use description/search instead of query.
 */
export function normalizeToolArgs(
  toolName: string,
  args: Record<string, unknown>,
): Record<string, unknown> {
  const out = { ...args };

  if (
    toolName === 'search_doctors' ||
    toolName === 'search_specialties'
  ) {
    if (typeof out.query !== 'string' || !out.query.trim()) {
      for (const key of [
        'description',
        'search',
        'term',
        'q',
        'text',
        'name',
        'specialty',
        'specialtyName',
      ]) {
        const candidate = out[key];
        if (typeof candidate === 'string' && candidate.trim()) {
          out.query = candidate.trim();
          break;
        }
      }
    }
    delete out.description;
    delete out.search;
    delete out.term;
  }

  if (typeof out.limit === 'string') {
    const parsed = Number(out.limit);
    if (!Number.isNaN(parsed)) out.limit = parsed;
  }

  if (typeof out.slotDurationMinutes === 'string') {
    const parsed = Number(out.slotDurationMinutes);
    if (!Number.isNaN(parsed)) out.slotDurationMinutes = parsed;
  }

  if (typeof out.maxSlots === 'string') {
    const parsed = Number(out.maxSlots);
    if (!Number.isNaN(parsed)) out.maxSlots = parsed;
  }

  return out;
}
