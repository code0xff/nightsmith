/**
 * Normalize a decoded call result (or an expected string) into a stable string,
 * guided by the ABI output type: integers → decimal string, address →
 * lowercase (only for real `address` slots), bool/string/bytes as-is.
 * Arrays/tuples and multi-return functions fall back to bigint-safe JSON.
 *
 * Shared by assertion evaluation (equality) and the `read` action (logging), so
 * it lives here rather than in either — assertions.ts already imports from
 * calls.ts, and calls.ts needs this too (a direct cross-import would cycle).
 */
export function normalizeTyped(value: unknown, type: string | undefined): string {
  // Scalar handling only for non-array types; arrays/tuples fall to the
  // bigint-safe JSON fallback below (so e.g. uint256[] doesn't hit BigInt()).
  if (type && !type.endsWith("]")) {
    if (type === "address" && typeof value === "string") return value.toLowerCase();
    // bytes/bytesN: viem decodes as lowercase hex; compare case-insensitively.
    if (type.startsWith("bytes") && typeof value === "string") return value.toLowerCase();
    if (type.startsWith("uint") || type.startsWith("int")) {
      // Never throw on a malformed value (e.g. "1.5" for a uint) — return a
      // sentinel that won't match a real decoded integer, so an assertion fails
      // cleanly instead of crashing evaluation.
      try {
        return BigInt(String(value)).toString();
      } catch {
        return `int?${String(value)}`;
      }
    }
    if (type === "bool") {
      // Only "true"/"false" are valid; an invalid value gets a sentinel so it
      // can't silently coerce to false and match a real `false` log.
      const s = String(value).toLowerCase();
      return s === "true" || s === "false" ? s : `bool?${String(value)}`;
    }
  }
  if (typeof value === "bigint") return value.toString();
  if (typeof value === "string") return value;
  return JSON.stringify(value, (_k, v) => (typeof v === "bigint" ? v.toString() : v));
}
