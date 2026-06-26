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
