# Usage

## Install & build

```bash
pnpm install
pnpm build                 # builds shared, contracts, server, and the web UI
pnpm --filter @blacksmith/server exec blacksmith doctor   # check anvil/forge/cast + ports
```

Requirements: Node ≥ 20, pnpm ≥ 11, and Foundry (`anvil`, `forge`, `cast`) on `PATH`.

If Anvil is missing, the cockpit shows an **"Anvil not found"** card with a
one-click, consented Foundry install (macOS/Linux) — it runs the official
`curl -L https://foundry.paradigm.xyz | bash && foundryup` and streams output to
the log console. On other platforms it links to the manual install. The server
also fails fast with that hint (instead of hanging) if you try to start a
localnet without Anvil.

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

## AI provider

By default Blacksmith uses the **mock** planner — a deterministic, offline
parser that needs no key or network. To use **OpenAI (ChatGPT)** instead:

- In the cockpit header, click the **AI** badge → choose *OpenAI* → paste an API
  key (`sk-…`) → Save. The key is stored locally at
  `~/.blacksmith/credentials.json` (mode 0600) and is sent only to OpenAI when
  generating a plan — never logged, never returned by the API.
- Or set it via environment: `BLACKSMITH_AI_PROVIDER=openai OPENAI_API_KEY=sk-…`
  (env always wins over the stored key). Model: `BLACKSMITH_OPENAI_MODEL`
  (default `gpt-5.5`).

To use a **no-key** path, pick **Codex CLI** in the same dialog (enabled when
`codex` is on your PATH). It runs `codex exec` non-interactively and reuses your
existing Codex/ChatGPT login — no API key, no extra billing setup. Codex runs
read-only, ephemeral, and in a throwaway working dir, so it acts as a pure plan
generator.

**Fallback:** providers degrade gracefully by availability — OpenAI (if a key is
present) → Codex CLI (if installed) → the mock planner (always). The log console
shows which provider produced each plan (e.g. "Plan generated via codex").

The provider only ever produces a reviewable plan; the deterministic executor
still runs it after validation and confirmation.

> **Note on "Sign in with ChatGPT":** OAuth login with a ChatGPT account does
> not grant access to the OpenAI API — API usage is billed separately and
> authenticated with an API key. (The Codex CLI's "Sign in with ChatGPT" is a
> product-specific flow, not a general API-OAuth.) Blacksmith therefore uses an
> API key, with the local "Connect" flow above to supply it at runtime.

## Configuration

| Env var | Default | Purpose |
| --- | --- | --- |
| `BLACKSMITH_PORT` | `4040` | Server/UI port |
| `BLACKSMITH_ANVIL_PORT` | `8545` | Anvil RPC port |
| `BLACKSMITH_DATA_DIR` | `~/.blacksmith` | Session store location |
| `BLACKSMITH_AI_PROVIDER` | `mock` | `mock` \| `openai` \| `anthropic` (anthropic is a stub) |
| `OPENAI_API_KEY` | — | OpenAI key (overrides the stored key) |
| `BLACKSMITH_OPENAI_MODEL` | `gpt-5.5` | OpenAI model for planning |
| `BLACKSMITH_ALLOW_FORK` | `false` | Allow forking a remote chain |
| `BLACKSMITH_ALLOW_BROADCAST` | `false` | Allow broadcasting beyond the local node |

See [SAFETY.md](SAFETY.md) for the safety model and [MANIFEST.md](MANIFEST.md)
for the manifest format.
