import { describe, expect, it } from "vitest";
import type { Runtime } from "../runtime/runtime.js";
import { resolveNamedAddressArgs } from "./calls.js";

// Minimal Runtime stub: only resolveAddress is used. Named accounts map to a
// deterministic address; a 0x literal passes through (as the real one does).
const runtime = {
  resolveAddress: (ref: string) =>
    ref === "Alice" ? "0xa11ce" : ref === "Bob" ? "0xb0b" : ref,
} as unknown as Runtime;

const inputs = (...types: string[]) => types.map((type) => ({ type }));

describe("resolveNamedAddressArgs", () => {
  it("resolves a named account in a top-level address arg", () => {
    expect(resolveNamedAddressArgs(runtime, inputs("address", "uint256"), ["Bob", "10"])).toEqual([
      "0xb0b",
      "10",
    ]);
  });

  it("resolves each element of an address[] arg", () => {
    expect(resolveNamedAddressArgs(runtime, inputs("address[]"), [["Alice", "Bob"]])).toEqual([
      ["0xa11ce", "0xb0b"],
    ]);
  });

  it("leaves non-address args (and unknown types) untouched", () => {
    expect(resolveNamedAddressArgs(runtime, inputs("uint256", "bool"), ["5", true])).toEqual([
      "5",
      true,
    ]);
  });

  it("passes a literal 0x address through unchanged", () => {
    const addr = "0x0000000000000000000000000000000000000001";
    expect(resolveNamedAddressArgs(runtime, inputs("address"), [addr])).toEqual([addr]);
  });
});
