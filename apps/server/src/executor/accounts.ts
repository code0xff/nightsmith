import type { AccountDef } from "@nightsmith/shared";
import { setBalance } from "../anvil/snapshot.js";
import type { Runtime } from "../runtime/runtime.js";
import { fromWei, toWei } from "./units.js";

/**
 * Resolve each named account from the Anvil mnemonic and set its starting ETH.
 * Anvil dev accounts start pre-funded (~10000 ETH). `fundEth` of "0" (the
 * default) means "leave that default" so every account holds gas; a non-zero
 * value sets the balance ABSOLUTELY — raising OR lowering it — so "start Alice
 * with 100 ETH" begins at exactly 100, not 10100.
 */
export async function setupAccounts(
  runtime: Runtime,
  accounts: AccountDef[],
): Promise<void> {
  const client = runtime.getPublicClient();
  for (const def of accounts) {
    const resolved = runtime.registerAccount(def.name, def.addressIndex);
    let balance = await client.getBalance({ address: resolved.address });

    const want = toWei(def.fundEth);
    if (def.fundEth !== "0" && want !== balance) {
      await setBalance(client, resolved.address, want);
      balance = want;
      runtime.log("info", `Set ${def.name} starting balance to ${def.fundEth} ETH`, "executor");
    }

    runtime.upsertAccountState({
      name: def.name,
      address: resolved.address,
      ethBalance: fromWei(balance),
      privateKey: resolved.privateKey,
    });
    runtime.log(
      "debug",
      `Account ${def.name} = ${resolved.address} (${fromWei(balance)} ETH)`,
      "executor",
    );
  }
}
