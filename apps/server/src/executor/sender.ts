import { parseEther, type Abi, type Hex, type TransactionReceipt } from "viem";
import { isAddress } from "@nightsmith/shared";
import { impersonate, setBalance, stopImpersonate } from "../anvil/snapshot.js";
import type { Runtime } from "../runtime/runtime.js";

// A sender impersonating a bare address needs ETH for gas. On a fork a real
// account already has it; locally an arbitrary address has none, so top it up.
const MIN_GAS = parseEther("0.1");
const GAS_TOPUP = parseEther("1");

export interface WriteParams {
  address: Hex;
  abi: Abi;
  functionName: string;
  args: readonly unknown[];
  /** Optional ETH value (wei) to send with the call. */
  value?: bigint;
}

export interface WriteResult {
  hash: Hex;
  receipt: TransactionReceipt;
  /** The resolved sender address (for tx records). */
  from: Hex;
}

/**
 * Send a contract write AS `senderRef`. A named account signs with its key; a
 * literal 0x address is impersonated (Anvil signs unsigned txs for it) — for
 * acting as an arbitrary user / a fork whale. Impersonation is always stopped
 * afterward, and the address is topped up for gas if it can't pay.
 */
export async function runWrite(
  runtime: Runtime,
  senderRef: string,
  params: WriteParams,
): Promise<WriteResult> {
  const chain = runtime.getChain();
  const client = runtime.getPublicClient();
  const write = (wallet: ReturnType<Runtime["walletFor"]>, account: Hex | { address: Hex }) =>
    wallet.writeContract({
      address: params.address,
      abi: params.abi,
      functionName: params.functionName,
      args: params.args as never,
      account: account as never,
      chain,
      ...(params.value !== undefined ? { value: params.value } : {}),
    });

  if (isAddress(senderRef)) {
    await impersonate(client, senderRef);
    // Impersonation must not perturb the address's own ETH: top up for gas if
    // needed, then always restore the pre-write balance. So an ethBalance
    // assertion on an impersonated address stays deterministic and unaffected by
    // the (test-only) gas we lent it.
    const preBalance = await client.getBalance({ address: senderRef });
    try {
      if (preBalance < MIN_GAS) await setBalance(client, senderRef, preBalance + GAS_TOPUP);
      const hash = await write(runtime.impersonatingWalletFor(senderRef), senderRef);
      const receipt = await client.waitForTransactionReceipt({ hash });
      return { hash, receipt, from: senderRef };
    } finally {
      await setBalance(client, senderRef, preBalance);
      await stopImpersonate(client, senderRef);
    }
  }

  const account = runtime.getAccount(senderRef);
  const hash = await write(runtime.walletFor(senderRef), account.account);
  const receipt = await client.waitForTransactionReceipt({ hash });
  return { hash, receipt, from: account.address };
}
