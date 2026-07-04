# Manifest format

The **World manifest** is Nightsmith's internal source of truth. The AI planner
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

## Actions

Run in order. `mint`/`transfer`/`approve`/`call` reference a `contractId`;
`mine` (chain control) references none.

| type | shape | notes |
| --- | --- | --- |
| `deployContract` | `{ contractId, deployer, args }` | `deployer` is a named account |
| `mint` | `{ contractId, to, amount }` | ERC20 mint |
| `transfer` | `{ contractId, from, to, amount }` | `from` may be a named account or an impersonated `0x` address |
| `approve` | `{ contractId, owner, spender, amount }` | `amount` decimal or `"max"` |
| `call` | `{ contractId, function, args, from, value? }` | any function; `value` = ETH (ether) |
| `mine` | `{ blocks?, secondsDelta? }` | advance time `secondsDelta` s, then mine `blocks` (default 1) |

## Assertions

Evaluated in order. Exact comparisons.

| type | shape | notes |
| --- | --- | --- |
| `tokenBalance` | `{ contractId, account, expected }` | ERC20 balance |
| `allowance` | `{ contractId, owner, spender, expected }` | `expected` decimal or `"max"` |
| `ethBalance` | `{ account, expected }` | native ETH (ether) |
| `callResult` | `{ contractId, function, args, expected }` | normalized return value; `expected` is a string |
| `event` | `{ contractId, event, args?, count? }` | emitted-event check; filter by `args`, exact `count` (omit ⇒ ≥1, `0` ⇒ not emitted) |

## Field notes

- **Amounts are decimal strings** (`"1000"`, `"10.5"`) in human units. The
  executor applies the token's `decimals` (native ETH uses 18, ≤18 fractional
  digits). Strings avoid float/bigint precision loss in JSON.
- **`accounts[].addressIndex`** maps a name to one of Anvil's deterministic dev
  accounts (0–9). These are public test keys, never real secrets. By convention
  `0 = deployer`, `1 = Alice`, `2 = Bob`.
- **`fundEth`** sets an account's **starting ETH**: `"0"` (the default) leaves
  Anvil's ~10000 ETH so the account holds gas; a non-zero value sets the balance
  **absolutely** (raising *or* lowering it), so "start Alice with 100 ETH" begins
  at exactly 100.
- **`contracts[]`** are definitions; **`actions[]`** reference them by `id` and
  control ordering (including the `deployContract` step).
- **Deterministic time.** For a local (non-fork) world, block timestamps are a
  pure function of block height (fixed genesis + fixed per-block interval, not
  wall-clock), so a manifest that uses `mine` to advance time replays to
  identical timestamps.
- **Validation** (`apps/server/src/manifest/validate.ts`) rejects manifests
  whose actions/assertions reference unknown accounts or contracts, or that have
  duplicate names/ids.

## Custom contracts

Beyond `MockERC20`, a contract can be `{ "kind": "artifact", "name": "<name>" }` —
a contract you **compiled from Solidity** at runtime (`.sol` / Foundry project /
`.zip`) or uploaded precompiled. Its ABI + bytecode are inlined server-side so the
manifest stays self-contained and replayable without the source or `forge`. Deploy
it with constructor `args`, drive it with `call`/`approve` actions, and verify with
`callResult`/`event`/`tokenBalance` assertions. See
[CUSTOM_CONTRACTS.md](CUSTOM_CONTRACTS.md).

## Extending

Both `contracts` (`kind`) and `actions`/`assertions` (`type`) are zod
discriminated unions. Add a new contract kind or action/assertion type to
`manifest.ts`, then handle it in the executor (`scenarios.ts`, `assertions.ts`,
`contracts.ts`). The discriminant keeps everything type-safe end to end.
