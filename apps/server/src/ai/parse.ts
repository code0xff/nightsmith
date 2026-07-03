import type { ControlAction, PlanIntent } from "@nightsmith/shared";

export interface TokenPreset {
  name: string;
  symbol: string;
  decimals: number;
}

const TOKEN_PRESETS: Record<string, TokenPreset> = {
  USDC: { name: "Mock USDC", symbol: "USDC", decimals: 6 },
  USDT: { name: "Mock USDT", symbol: "USDT", decimals: 6 },
  DAI: { name: "Mock DAI", symbol: "DAI", decimals: 18 },
  WETH: { name: "Mock WETH", symbol: "WETH", decimals: 18 },
};

/** Pick a token from the prompt; default to a mock USDC (6 decimals). */
export function parseToken(prompt: string): TokenPreset {
  const upper = prompt.toUpperCase();
  for (const [key, preset] of Object.entries(TOKEN_PRESETS)) {
    if (upper.includes(key)) return preset;
  }
  return TOKEN_PRESETS.USDC!;
}

const num = (raw: string): string => raw.replace(/,/g, "");
const hasHangul = (s: string): boolean => /[가-힣]/.test(s);

// A recipient reference: a capitalized name OR a literal 20-byte 0x address.
const REF = "([A-Z][a-zA-Z]+|0x[0-9a-fA-F]{40})";

// Canonicalize addresses to lowercase so mixed-casing of the same address
// can't create two distinct balance/assertion slots.
const canon = (ref: string): string =>
  /^0x[0-9a-fA-F]{40}$/i.test(ref) ? ref.toLowerCase() : ref;

/** Extract initial balances and explicit "mint N to <ref>" amounts, in order. */
export function parseBalances(prompt: string): Array<{ ref: string; amount: string }> {
  const out: Array<{ ref: string; amount: string }> = [];
  const seen = new Set<string>();
  const add = (ref: string, amount: string) => {
    const r = canon(ref);
    if (!seen.has(r)) {
      seen.add(r);
      out.push({ ref: r, amount: num(amount) });
    }
  };

  // "<ref> should have 1000", "0x… has 1000", etc.
  const have = new RegExp(
    `${REF}\\s+(?:should\\s+have|should\\s+hold|has|have|holds|owns?|gets?|starts?\\s+with)\\s+([\\d,]+(?:\\.\\d+)?)`,
    "gi",
  );
  for (const m of prompt.matchAll(have)) add(m[1]!, m[2]!);

  // "mint 1000 [USDC] to <ref>" — amount first, recipient second.
  const mintTo = new RegExp(
    `\\bmint(?:s|ed)?\\s+([\\d,]+(?:\\.\\d+)?)[^.]*?\\bto\\s+${REF}`,
    "gi",
  );
  for (const m of prompt.matchAll(mintTo)) add(m[2]!, m[1]!);

  // Korean phrasing like "Alice에게 1000 USDC". Guarded to Hangul prompts.
  if (hasHangul(prompt)) {
    const korean =
      /([A-Z][a-zA-Z]+)(?:에게|은|는|이|가)?\s*([\d,]+(?:\.\d+)?)\s*(?:USDC|USDT|DAI|WETH|토큰|개)/gi;
    for (const m of prompt.matchAll(korean)) add(m[1]!, m[2]!);
  }

  return out;
}

/** Extract a single transfer; `from` is a named account, `to` may be an address. */
export function parseTransfer(
  prompt: string,
): { from: string; to: string; amount: string } | null {
  const sends = new RegExp(
    `([A-Z][a-zA-Z]+)\\s+sends?\\s+${REF}\\s+([\\d,]+(?:\\.\\d+)?)`,
    "i",
  ).exec(prompt);
  if (sends) return { from: sends[1]!, to: canon(sends[2]!), amount: num(sends[3]!) };

  const fromTo = new RegExp(
    `transfers?\\s+([\\d,]+(?:\\.\\d+)?)[^.]*?from\\s+([A-Z][a-zA-Z]+)\\s+to\\s+${REF}`,
    "i",
  ).exec(prompt);
  if (fromTo) return { from: fromTo[2]!, to: canon(fromTo[3]!), amount: num(fromTo[1]!) };

  const arrow = new RegExp(
    `([A-Z][a-zA-Z]+)\\s*(?:->|→)\\s*${REF}\\s*:?\\s*([\\d,]+(?:\\.\\d+)?)`,
  ).exec(prompt);
  if (arrow) return { from: arrow[1]!, to: canon(arrow[2]!), amount: num(arrow[3]!) };

  const korean =
    /([A-Z][a-zA-Z]+)\s*(?:가|이|는|은)?\s*([A-Z][a-zA-Z]+)(?:에게|한테)\s*([\d,]+(?:\.\d+)?)/.exec(
      prompt,
    );
  if (korean) return { from: korean[1]!, to: korean[2]!, amount: num(korean[3]!) };

  return null;
}

/** Extract a "change <ref>'s balance to <amount>" modification, if present. */
export function parseBalanceChange(
  prompt: string,
): { ref: string; amount: string } | null {
  const english = new RegExp(
    // "reset X's balance to N" is an explicit modify verb here (don't rely on
    // "set" ⊂ "reset"); the reset guard in detectIntent only fires when no
    // such balance target is present.
    `\\b(?:change|set|reset|make|update)\\s+${REF}(?:'s)?\\s+(?:initial\\s+)?balance\\s+(?:to\\s+)?([\\d,]+(?:\\.\\d+)?)`,
    "i",
  ).exec(prompt);
  if (english) return { ref: canon(english[1]!), amount: num(english[2]!) };

  const korean =
    /([A-Z][a-zA-Z]+)\s*의\s*(?:초기\s*)?잔액을?\s*([\d,]+(?:\.\d+)?)/.exec(prompt);
  if (korean) return { ref: korean[1]!, amount: num(korean[2]!) };

  return null;
}

const CONTROL_KEYWORDS: Array<{ re: RegExp; kind: ControlAction["kind"] }> = [
  { re: /\b(stop|halt|shutdown|shut down)\b|중지|정지|멈춰/i, kind: "stop" },
  { re: /\bexport\b|내보내/i, kind: "export" },
  { re: /\bresume\b|이어서|재개/i, kind: "resume" },
];

export function parseControl(prompt: string): ControlAction | null {
  for (const { re, kind } of CONTROL_KEYWORDS) {
    if (re.test(prompt)) return { kind };
  }
  return null;
}

const REPLAY_RE = /\breplay\b|다시\s*실행|run\b.*\bagain\b|again\b/i;
const EXPLAIN_RE = /\bexplain\b|\bwhy\b|왜|이유|설명/i;
/** Leftover "reset the localnet" phrasing — reset was removed as a control. */
export const RESET_RE = /\breset\b|초기화/i;
const MODIFY_RE = /\bchange\b|\bset\b|\bmodify\b|\bupdate\b|\binstead\b|바꾸|수정|변경/i;
// Additive follow-up cues. Deliberately excludes "이어서"/"계속"/"resume", which
// are control (resume) keywords, to avoid hijacking that intent.
const EXTEND_RE = /\b(also|then|next|additionally|append|as well|and then)\b|그다음|그 다음|추가로|또한/i;
// Requests that clearly want a brand-new world, even while one is running.
const CREATE_RE = /\b(create|build|new world|fresh|from scratch|start over)\b|새(로운)?\s*월드|처음부터/i;

/**
 * Classify the prompt into a plan intent. `running` (localnet up) distinguishes
 * an additive follow-up (extendWorld — append onto the live world) from a
 * from-scratch build.
 */
export function detectIntent(
  prompt: string,
  hasPrevious: boolean,
  running = false,
): PlanIntent {
  if (EXPLAIN_RE.test(prompt)) return "explain";
  const hasChange = MODIFY_RE.test(prompt) || parseBalanceChange(prompt) != null;
  // "reset the localnet" / "초기화" no longer maps to a control (reset was
  // removed). Route a bare reset request to a non-mutating explanation rather
  // than silently falling through to the create-world default below. Guard
  // against "reset Bob's balance to X", which is a modify.
  if (
    RESET_RE.test(prompt) &&
    !hasChange &&
    parseTransfer(prompt) == null &&
    parseBalances(prompt).length === 0
  ) {
    return "explain";
  }
  if (hasPrevious && hasChange) return "modifyWorld";
  // Append onto the already-running world when the prompt adds a new action and
  // isn't a modify, a lifecycle control (stop/export/…), or an explicit "create
  // a new world" request.
  if (
    hasPrevious &&
    running &&
    !hasChange &&
    parseControl(prompt) == null &&
    !CREATE_RE.test(prompt)
  ) {
    const additive =
      EXTEND_RE.test(prompt) ||
      parseTransfer(prompt) != null ||
      parseBalances(prompt).length > 0;
    if (additive) return "extendWorld";
  }
  if (REPLAY_RE.test(prompt)) return "runScenario";
  if (parseControl(prompt) && !hasChange) return "control";
  return "createWorld";
}
