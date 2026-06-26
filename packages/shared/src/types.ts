import { z } from "zod";

/** A 0x-prefixed hex string (address, hash, calldata). Loosely validated. */
export const HexString = z
  .string()
  .regex(/^0x[0-9a-fA-F]*$/, "must be a 0x-prefixed hex string");
export type HexString = z.infer<typeof HexString>;

/** A 20-byte EVM address. */
export const Address = z
  .string()
  .regex(/^0x[0-9a-fA-F]{40}$/, "must be a 20-byte 0x address");
export type Address = z.infer<typeof Address>;

/**
 * A human-readable decimal amount, kept as a string to avoid float/bigint
 * precision loss in JSON. Token decimals are applied by the executor.
 * Examples: "1000", "10.5", "0".
 */
export const DecimalAmount = z
  .string()
  .regex(/^\d+(\.\d+)?$/, "must be a non-negative decimal string");
export type DecimalAmount = z.infer<typeof DecimalAmount>;

/** A short, stable identifier (account name, contract id). */
export const Identifier = z
  .string()
  .min(1)
  .max(64)
  .regex(/^[A-Za-z0-9_-]+$/, "use letters, numbers, _ or -");
export type Identifier = z.infer<typeof Identifier>;

const ADDRESS_RE = /^0x[0-9a-fA-F]{40}$/;
const NAME_RE = /^[A-Za-z][A-Za-z0-9_-]*$/;

/** True when a reference is a literal 0x address (vs. a named account). */
export function isAddress(ref: string): ref is `0x${string}` {
  return ADDRESS_RE.test(ref);
}

/**
 * A reference to an account: either a named account (must start with a letter,
 * e.g. "Alice") or a literal 20-byte 0x address. The leading-letter rule keeps
 * a hex address from being misread as a name.
 */
export const AccountRef = z
  .string()
  .min(1)
  .refine((s) => ADDRESS_RE.test(s) || NAME_RE.test(s), {
    message: "must be an account name (letter-leading) or a 0x address",
  });
export type AccountRef = z.infer<typeof AccountRef>;

/**
 * A named account (signer-capable). Like Identifier but explicitly NOT an
 * address — so a manifest can't declare an account literally named "0x…" and
 * smuggle a non-signable address into a signer slot.
 */
export const AccountName = Identifier.refine((s) => !isAddress(s), {
  message: "account name must not look like a 0x address",
});
export type AccountName = z.infer<typeof AccountName>;
