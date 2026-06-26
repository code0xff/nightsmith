import type { AccountDef } from "@blacksmith/shared";
import { setBalance } from "../anvil/snapshot.js";
import type { Runtime } from "../runtime/runtime.js";
import { fromWei, toWei } from "./units.js";

/**
 * Resolve each named account from the Anvil mnemonic and ensure it holds at
 * least its requested ETH. Anvil dev accounts start pre-funded, so funding is
 * a top-up only — we never reduce a balance.
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
    if (want > balance) {
      await setBalance(client, resolved.address, want);
      balance = want;
      runtime.log("info", `Funded ${def.name} with ${def.fundEth} ETH`, "executor");
    }

    runtime.upsertAccountState({
      name: def.name,
      address: resolved.address,
      ethBalance: fromWei(balance),
    });
    runtime.log(
      "debug",
      `Account ${def.name} = ${resolved.address} (${fromWei(balance)} ETH)`,
      "executor",
    );
  }
}
