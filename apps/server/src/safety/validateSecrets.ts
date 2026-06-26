import { SafetyError } from "../utils/errors.js";

interface SecretRule {
  label: string;
  pattern: RegExp;
}

// Patterns that should never be sent to an AI provider or persisted.
const SECRET_RULES: SecretRule[] = [
  { label: "raw private key (0x + 64 hex)", pattern: /\b0x[0-9a-fA-F]{64}\b/ },
  { label: "PEM private key block", pattern: /-----BEGIN [A-Z ]*PRIVATE KEY-----/ },
  { label: "OpenAI-style API key", pattern: /\bsk-[A-Za-z0-9]{20,}\b/ },
  { label: "GitHub token", pattern: /\bgh[pousr]_[A-Za-z0-9]{20,}\b/ },
  { label: "AWS access key id", pattern: /\bAKIA[0-9A-Z]{16}\b/ },
];

/** Return labels of any secret-looking content found in `text`. */
export function scanForSecrets(text: string): string[] {
  return SECRET_RULES.filter((r) => r.pattern.test(text)).map((r) => r.label);
}

/**
 * Guard a user prompt before it reaches an AI provider. Blacksmith never sends
 * private keys or secrets to a model, and never needs them — local execution
 * uses Anvil's public test accounts only.
 */
export function assertPromptHasNoSecrets(prompt: string): void {
  const found = scanForSecrets(prompt);
  if (found.length > 0) {
    throw new SafetyError(
      "Your prompt appears to contain a private key or secret. Blacksmith will not send secrets to an AI provider — remove it and try again. Local execution only needs Anvil's public test accounts.",
      found,
    );
  }
}
