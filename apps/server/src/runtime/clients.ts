import {
  createPublicClient,
  createWalletClient,
  defineChain,
  http,
  type Chain,
  type PublicClient,
  type WalletClient,
} from "viem";
import { mnemonicToAccount, type HDAccount } from "viem/accounts";

/** Build a viem chain definition for a local Anvil node. */
export function makeChain(chainId: number, rpcUrl: string): Chain {
  return defineChain({
    id: chainId,
    name: `anvil-${chainId}`,
    nativeCurrency: { name: "Ether", symbol: "ETH", decimals: 18 },
    rpcUrls: { default: { http: [rpcUrl] } },
  });
}

export function makePublicClient(chain: Chain, rpcUrl: string): PublicClient {
  // cacheTime: 0 — never serve a stale block number; local blocks advance fast.
  return createPublicClient({ chain, transport: http(rpcUrl), cacheTime: 0 });
}

export function makeWalletClient(
  chain: Chain,
  rpcUrl: string,
  account: HDAccount,
): WalletClient {
  return createWalletClient({ account, chain, transport: http(rpcUrl) });
}

/**
 * Derive a deterministic account from the Anvil mnemonic by index. These are
 * public test keys — Nightsmith never handles real private keys.
 */
export function accountAtIndex(mnemonic: string, addressIndex: number): HDAccount {
  return mnemonicToAccount(mnemonic, { addressIndex });
}
