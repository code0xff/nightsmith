/**
 * AI credentials. The OpenAI key is read from the OPENAI_API_KEY environment
 * variable ONLY — Nightsmith never stores it on disk or accepts it over the
 * API. Provider selection is automatic by availability.
 */

/** Resolve the OpenAI key from the environment. Empty/whitespace counts as none. */
export function resolveOpenAiKey(): string | undefined {
  const key = process.env.OPENAI_API_KEY?.trim();
  return key ? key : undefined;
}

export function isOpenAiConnected(): boolean {
  return resolveOpenAiKey() !== undefined;
}
