import { toast } from "sonner";

/** Minimal EIP-1193 provider surface (injected by MetaMask & compatible wallets). */
interface Eip1193Provider {
  request(args: { method: string; params?: unknown[] }): Promise<unknown>;
}

function injectedProvider(): Eip1193Provider | undefined {
  return (window as unknown as { ethereum?: Eip1193Provider }).ethereum;
}

/**
 * Add (and switch to) the running localnet in an injected wallet like MetaMask
 * via EIP-3085 `wallet_addEthereumChain`. Purely client-side — the wallet is in
 * the same browser, so the local RPC URL is reachable.
 */
export async function addLocalnetToWallet(opts: {
  chainId: number;
  rpcUrl: string;
  sessionName?: string;
}): Promise<void> {
  const provider = injectedProvider();
  if (!provider) {
    toast.error("No wallet detected", {
      description: "Install MetaMask (or another injected wallet) to add the localnet.",
    });
    return;
  }

  const chainIdHex = `0x${opts.chainId.toString(16)}`;

  // Switch first: if a network with this chainId already exists (e.g. a prior
  // Localhost/Anvil entry, or MetaMask's record for 31337), switching avoids the
  // nativeCurrency-symbol conflict that `wallet_addEthereumChain` raises when the
  // symbols differ. Only fall back to adding when the chain isn't there (4902).
  try {
    await provider.request({
      method: "wallet_switchEthereumChain",
      params: [{ chainId: chainIdHex }],
    });
    toast.success("Wallet switched to localnet", { description: `${chainIdHex} · ${opts.rpcUrl}` });
    return;
  } catch (err) {
    const e = err as { code?: number };
    if (e.code === 4001) {
      toast("Cancelled", { description: "Wallet request was rejected." });
      return;
    }
    // 4902 = chain not added yet → fall through to add it. Any other error, try
    // adding too (some wallets don't implement switch).
  }

  try {
    await provider.request({
      method: "wallet_addEthereumChain",
      params: [
        {
          chainId: chainIdHex,
          chainName: opts.sessionName
            ? `Nightsmith · ${opts.sessionName}`
            : "Nightsmith Localnet",
          rpcUrls: [opts.rpcUrl],
          nativeCurrency: { name: "Ether", symbol: "ETH", decimals: 18 },
        },
      ],
    });
    toast.success("Localnet added to wallet", { description: `${chainIdHex} · ${opts.rpcUrl}` });
  } catch (err) {
    const e = err as { code?: number; message?: string };
    if (e.code === 4001) {
      toast("Cancelled", { description: "Wallet request was rejected." });
    } else if (e.message?.includes("symbol")) {
      // The chainId already exists in the wallet with a different native symbol
      // (chainId 31337 is publicly registered as GoChain/GO). Nothing to fix on
      // our side — the existing network already points at this RPC.
      toast.error("Network already exists in wallet", {
        description: `Select the chain ${chainIdHex} network manually — the wallet keeps its existing name/symbol.`,
      });
    } else {
      toast.error("Couldn't add network", {
        description: e.message ?? "The wallet rejected the request.",
      });
    }
  }
}
