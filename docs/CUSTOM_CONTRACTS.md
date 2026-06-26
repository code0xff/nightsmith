# Custom contracts

Beyond the built-in MockERC20, you can upload your own **compiled** contract,
deploy it with constructor arguments, call its functions to initialize/drive
state, and assert on return values — all prompt-driven.

> No runtime Solidity compilation: upload an already-compiled artifact
> (ABI + bytecode). Compile with `forge build` / `solc` / Hardhat first.

## 1. Upload an artifact

- **Cockpit:** ops rail → **Contracts → Upload** → give it a name and paste a
  Foundry/Hardhat artifact JSON (or `{ "abi": [...], "bytecode": "0x..." }`).
- **API:** `POST /api/artifacts` with `{ name, abi, bytecode }`.

Artifacts are stored locally under `~/.nightsmith/artifacts/`. The planner sees
the uploaded names + ABI signatures and references them **by name** — the server
fills in abi/bytecode when building the manifest.

## 2. Deploy + init from a prompt

```
"Deploy MyVault with owner Alice and a cap of 1000000, then set the fee to 30
 and verify feeBps() returns 30."
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
    { "type": "callResult", "contractId": "vault", "function": "feeBps", "args": [], "expected": "30" }
  ]
}
```

## Action / assertion reference

- **`deployContract`** `{ contractId, deployer, args }` — `deployer` is a named
  account; `args` are the constructor arguments.
- **`call`** `{ contractId, function, args, from, value? }` — invoke any function
  from a named signer; `value` is optional ETH (ether string).
- **`callResult`** `{ contractId, function, args, expected }` — read a view/pure
  function and compare its normalized result to `expected`.

### Argument conventions

| ABI type | Pass as |
| --- | --- |
| `uintN` / `intN` | decimal **string** (e.g. `"1000000"`) |
| `address` / `bytesN` / `bytes` | `0x…` string |
| `bool` | `true` / `false` |
| arrays (`T[]`) | JSON array of the above |

Integers as strings avoid JSON precision loss; the executor coerces them per the
ABI before encoding with viem.

## Limitations (current)

- **No tuples/structs** as arguments yet.
- **No overloaded functions** — reference a uniquely-named function.
- Signers (`from`, `deployer`) must be **named Anvil accounts** — Nightsmith can
  only sign for those.
- Best results via the OpenAI or Codex provider (they map prompt values → typed
  args from the ABI); the mock planner targets the built-in token world.
