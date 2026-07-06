import { describe, expect, it } from "vitest";
import { normalizeTyped } from "./format.js";

describe("normalizeTyped", () => {
  it("renders integers as a decimal string (bigint or string input)", () => {
    expect(normalizeTyped(1_100_000_000n, "uint256")).toBe("1100000000");
    expect(normalizeTyped("990000000", "uint256")).toBe("990000000");
  });

  it("lowercases addresses", () => {
    expect(normalizeTyped("0xAbC0000000000000000000000000000000000123", "address")).toBe(
      "0xabc0000000000000000000000000000000000123",
    );
  });

  it("passes bool and string through", () => {
    expect(normalizeTyped(true, "bool")).toBe("true");
    expect(normalizeTyped("Mock USDC", "string")).toBe("Mock USDC");
  });

  it("falls back to bigint-safe JSON for arrays / untyped values", () => {
    expect(normalizeTyped([1n, 2n], "uint256[]")).toBe('["1","2"]');
    expect(normalizeTyped(42n, undefined)).toBe("42");
  });
});
