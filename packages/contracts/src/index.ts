import artifact from "../artifacts/MockERC20.json" with { type: "json" };

/**
 * Precompiled MockERC20 artifact. Deployed at runtime with viem — no solc
 * needed. Regenerate with `pnpm --filter @blacksmith/contracts compile`.
 */
export const MockERC20 = {
  abi: artifact.abi,
  bytecode: artifact.bytecode as `0x${string}`,
} as const;

export const MockERC20Abi = MockERC20.abi;
export const MockERC20Bytecode = MockERC20.bytecode;
