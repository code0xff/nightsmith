# Manifest format

The **World manifest** is Blacksmith's internal source of truth. The AI planner
generates it, the safety validator checks it, and the executor runs it
deterministically. You never have to hand-write one — but you can export, edit,
and replay it. The schema lives in `packages/shared/src/manifest.ts` (zod).

## Execution order

A manifest is executed in a fixed, deterministic order:

1. Start the network (`network`).
2. Resolve and fund accounts (`accounts`).
3. Run `actions` in order.
4. Evaluate `assertions` in order.

Same manifest → same world, every time.

## Shape

```jsonc
{
  "version": 1,
  "name": "USDC payment world",
  "description": "optional",
  "createdAt": "2026-06-26T00:00:00.000Z",

  "network": {
    "kind": "anvil-local",   // only supported kind
    "chainId": 31337,
    "port": 8545,
    "forkUrl": null,          // null = fresh local chain (the safe default)
    "broadcast": false        // never broadcast off-node by default
  },

  "accounts": [
    { "name": "deployer", "addressIndex": 0, "fundEth": "0" },
    { "name": "Alice",    "addressIndex": 1, "fundEth": "0" },
    { "name": "Bob",      "addressIndex": 2, "fundEth": "0" }
  ],

  "contracts": [
    { "id": "usdc", "kind": "MockERC20", "name": "Mock USDC", "symbol": "USDC", "decimals": 6 }
  ],

  "actions": [
    { "type": "deployContract", "contractId": "usdc", "deployer": "deployer" },
    { "type": "mint", "contractId": "usdc", "to": "Alice", "amount": "1000" },
    { "type": "mint", "contractId": "usdc", "to": "Bob",   "amount": "100" },
    { "type": "transfer", "contractId": "usdc", "from": "Alice", "to": "Bob", "amount": "10" }
  ],

  "assertions": [
    { "type": "tokenBalance", "contractId": "usdc", "account": "Alice", "expected": "990" },
    { "type": "tokenBalance", "contractId": "usdc", "account": "Bob",   "expected": "110" }
  ]
}
```

## Field notes

- **Amounts are decimal strings** (`"1000"`, `"10.5"`) in human units. The
  executor applies the token's `decimals` (or 18 for ETH). Strings avoid
  float/bigint precision loss in JSON.
- **`accounts[].addressIndex`** maps a name to one of Anvil's deterministic dev
  accounts (0–9). These are public test keys, never real secrets. By convention
  `0 = deployer`, `1 = Alice`, `2 = Bob`.
- **`fundEth`** is a *top-up minimum* — Anvil dev accounts already start with
  10000 ETH, so funding never reduces a balance.
- **`contracts[]`** are definitions; **`actions[]`** reference them by `id` and
  control ordering (including the `deployContract` step).
- **Validation** (`apps/server/src/manifest/validate.ts`) rejects manifests
  whose actions/assertions reference unknown accounts or contracts, or that have
  duplicate names/ids.

## Extending

Both `contracts` (`kind`) and `actions`/`assertions` (`type`) are zod
discriminated unions. Add a new contract kind or action/assertion type to
`manifest.ts`, then handle it in the executor (`scenarios.ts`, `assertions.ts`,
`contracts.ts`). The discriminant keeps everything type-safe end to end.
