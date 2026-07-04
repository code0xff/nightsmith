# Custom contracts

Beyond the built-in MockERC20, you can bring your own contract — **compile it
from Solidity at runtime, or upload a precompiled artifact** — then deploy it
with constructor arguments, call its functions to initialize/drive state, and
assert on results and emitted events, all prompt-driven.

## 1. Add a contract

Open the ops rail → **Contracts → Add**. Three input modes:

- **Solidity source** — paste a `.sol` (or choose a file), or give a **server
  path** to a `.sol` file / Foundry project. Nightsmith compiles it with
  `forge` and stores the resulting artifact. A pasted single file must be
  self-contained; a real project (or a `.sol` inside one) resolves its relative
  imports and `node_modules` dependencies (OpenZeppelin, etc.).
- **Project (.zip)** — upload a zipped Foundry project (or a plain `.sol`-only
  project — Nightsmith scaffolds one). Give the **contract name** to select when
  the project has several.
- **Compiled JSON** — paste an already-compiled Foundry/Hardhat artifact, or
  `{ "abi": [...], "bytecode": "0x..." }` (no compiler needed).

From the CLI (works without the server running):

```bash
nightsmith compile ./src/MyVault.sol            # store as "MyVault"
nightsmith compile ./contracts/UniswapV2Pair.sol --contract UniswapV2Pair
nightsmith compile ./my-foundry-project --contract MyVault --name Vault
```

Or the API: `POST /api/artifacts/compile` with `{ source }`, `{ path }`, or
`{ zipBase64, contractName }`; `POST /api/artifacts` with `{ name, abi, bytecode }`
for a precompiled upload.

Artifacts are stored locally under `~/.nightsmith/artifacts/`. Compilation runs
`forge build` only (never `forge test`/`script`, never `ffi`); the first compile
of a given Solidity version may download that `solc` via `svm`. Progress streams
to the log console. The planner sees each stored name, its ABI signatures, and —
for compiled contracts — NatSpec docs, so it can reference them **by name** and
pick the right functions/args; the server fills abi/bytecode in when building the
manifest.

## 2. Deploy + drive from a prompt

```
"Deploy MyVault with owner Alice and a cap of 1000000, then set the fee to 30
 and verify feeBps() returns 30 and a FeeSet event was emitted."
```

The planner produces a manifest like:

```jsonc
{
  "contracts": [
    { "id": "vault", "kind": "artifact", "name": "MyVault" }   // server hydrates abi+bytecode
  ],
  "actions": [
    { "type": "deployContract", "contractId": "vault", "deployer": "deployer",
      "args": ["0x<Alice>", "1000000"] },
    { "type": "call", "contractId": "vault", "function": "setFee", "from": "deployer",
      "args": ["30"] }
  ],
  "assertions": [
    { "type": "callResult", "contractId": "vault", "function": "feeBps", "args": [], "expected": "30" },
    { "type": "event", "contractId": "vault", "event": "FeeSet", "args": { "bps": "30" } }
  ]
}
```

## Action / assertion reference

Actions (run in order):

- **`deployContract`** `{ contractId, deployer, args }` — `deployer` is a named
  account; `args` are the constructor arguments.
- **`mint`** `{ contractId, to, amount }` / **`transfer`** `{ contractId, from, to, amount }`
  — MockERC20-style token ops (also work on any uploaded ERC20-shaped contract).
- **`approve`** `{ contractId, owner, spender, amount }` — ERC20 allowance;
  `amount` is a decimal string or `"max"` (unlimited).
- **`call`** `{ contractId, function, args, from, value? }` — invoke any function;
  `value` is optional ETH (ether string).
- **`mine`** `{ blocks?, secondsDelta? }` — advance the chain: jump the block
  timestamp forward `secondsDelta` seconds and mine `blocks` block(s). For
  vesting / timelock / cooldown tests. References no contract.

Assertions (evaluated in order):

- **`callResult`** `{ contractId, function, args, expected }` — read a view/pure
  function and compare its normalized result to `expected`.
- **`tokenBalance`** `{ contractId, account, expected }` — exact ERC20 balance.
- **`allowance`** `{ contractId, owner, spender, expected }` — ERC20 allowance
  (`expected` may be `"max"`).
- **`ethBalance`** `{ account, expected }` — exact native ETH balance (ether).
- **`event`** `{ contractId, event, args?, count? }` — assert an event was
  emitted; optionally filter by named `args`, and require an exact `count`
  (omit for "at least one", `0` for "not emitted").

### Signers and impersonation

`deployer` must be a named Anvil account (Nightsmith holds its key). A **signer**
— a transfer `from`, an approve `owner`, a call `from` — is normally a named
account too, but it **may also be a literal `0x` address**, which Nightsmith
**impersonates** (Anvil signs for it without its key). Use it to act as an
arbitrary user, or as a whale on a fork. Impersonation never alters the address's
own ETH balance (gas is subsidized invisibly).

### Argument conventions

| ABI type | Pass as |
| --- | --- |
| `uintN` / `intN` | decimal **string** (e.g. `"1000000"`) |
| `address` / `bytesN` / `bytes` | `0x…` string (an address arg may also be a named account) |
| `bool` | `true` / `false` |
| arrays (`T[]`, `T[N]`) | JSON array of the above |
| tuple / struct | JSON object keyed by field name (e.g. `{ "owner": "0x…", "amount": "100" }`) or an ordered array |

Integers as strings avoid JSON precision loss; the executor coerces every value
per the ABI (recursively, including nested tuples and arrays) before encoding
with viem. A `callResult` `expected` is always a string, whatever the return type.

## Limitations (current)

- **External library linking** is not supported — a contract whose creation
  bytecode carries `__$…$__` library placeholders is rejected at compile with the
  library names. Inline the library (make its functions `internal`) instead.
- **Overloaded functions/events** aren't supported — reference a uniquely-named one.
- **Multi-file paste** isn't supported in the source box — use a server **path**
  or a **`.zip`** for projects with imports/`node_modules`.
- Best results via the OpenAI, Codex, or Claude provider (they map prompt values →
  typed args from the ABI/NatSpec); the mock planner targets the built-in token world.
