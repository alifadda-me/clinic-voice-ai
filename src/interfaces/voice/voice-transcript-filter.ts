/** Drop internal English reasoning from voice UI logs (audio may still play). */
export function isVoiceReasoningTranscript(text: string): boolean {
  const trimmed = text.trim();
  if (!trimmed) return true;
  if (/^\*\*[^*]+\*\*/.test(trimmed)) return true;
  if (
    /^(I'm|I am|I will|I'll|I've|My next|Initiating|Refining|Investigating|Evaluating)\b/.test(
      trimmed,
    )
  ) {
    return true;
  }
  if (trimmed.includes('`search_') || trimmed.includes('INVALID_ARGUMENTS')) {
    return true;
  }
  return false;
}
