# Usage

## Install & build

```bash
pnpm install
pnpm build                 # builds shared, contracts, server, and the web UI
pnpm --filter @blacksmith/server exec blacksmith doctor   # check anvil/forge/cast + ports
```

Requirements: Node ≥ 20, pnpm ≥ 11, and Foundry (`anvil`, `forge`, `cast`) on `PATH`.

## Run the cockpit

```bash
pnpm --filter @blacksmith/server exec blacksmith serve
# open http://localhost:4040
```

`serve` starts the local server and serves the built web UI from the same
process (it streams logs/state over `ws://localhost:4040/ws`).

### Demo flow

1. Enter a prompt, e.g.:
   > Create a local USDC payment test world. Alice should have 1000 USDC, Bob should have 100 USDC, then Alice sends Bob 10 USDC and the final balance should be verified.
2. Review the generated **plan preview** (summary, steps, assumptions, expected
   changes, assertions, safety notes).
3. Click **Run**. Watch logs stream and the world-state panels update:
   localnet status, MockUSDC address, Alice/Bob balances, transactions, and the
   assertion result (Bob ends with 110 USDC).
4. Modify and re-run, e.g.:
   > Bob의 초기 잔액을 500 USDC로 바꾸고 다시 실행해줘
5. Use the direct controls (Start / Stop / Reset / Snapshot / Revert / Replay /
   Export) at any time.

### Prompt examples

- "Create a local USDC payment test world with Alice and Bob"
- "Replay the last scenario"
- "Reset the localnet and run the payment flow again"
- "Explain why the last transaction reverted"
- "Stop the localnet"
- "Export this world as a replayable manifest"

## Development

```bash
pnpm dev        # server in watch mode (tsx) on :4040
pnpm dev:web    # Vite dev server on :4042, proxies /api and /ws to :4040
pnpm demo       # headless prompt -> plan -> execute (asserts Bob = 110 USDC)
pnpm typecheck  # typecheck all packages
```

In dev, run `pnpm dev` and `pnpm dev:web` in two terminals and open the Vite URL.

## CLI

```bash
blacksmith serve              # start server + web cockpit
blacksmith stop               # stop the running localnet (talks to the server)
blacksmith doctor             # check toolchain + ports
blacksmith export <sessionId> [-o file.json]   # export a session's manifest
blacksmith replay <sessionId> # headlessly replay a saved session
```

Sessions are stored under `~/.blacksmith/sessions/<id>/` (manifest, report,
logs). Override with `BLACKSMITH_DATA_DIR`.

## Configuration

| Env var | Default | Purpose |
| --- | --- | --- |
| `BLACKSMITH_PORT` | `4040` | Server/UI port |
| `BLACKSMITH_ANVIL_PORT` | `8545` | Anvil RPC port |
| `BLACKSMITH_DATA_DIR` | `~/.blacksmith` | Session store location |
| `BLACKSMITH_AI_PROVIDER` | `mock` | `mock` \| `openai` \| `anthropic` (latter two are stubs) |
| `BLACKSMITH_ALLOW_FORK` | `false` | Allow forking a remote chain |
| `BLACKSMITH_ALLOW_BROADCAST` | `false` | Allow broadcasting beyond the local node |

See [SAFETY.md](SAFETY.md) for the safety model and [MANIFEST.md](MANIFEST.md)
for the manifest format.
