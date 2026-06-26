import type { PublicClient } from "viem";

export interface ChainStatus {
  chainId: number;
  blockNumber: number;
}

/** Read the live chain id and block height from a running node. */
export async function getChainStatus(client: PublicClient): Promise<ChainStatus> {
  const [chainId, blockNumber] = await Promise.all([
    client.getChainId(),
    client.getBlockNumber(),
  ]);
  return { chainId, blockNumber: Number(blockNumber) };
}
