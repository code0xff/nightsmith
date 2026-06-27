# Usage

## Install & build

```bash
pnpm install
pnpm build                 # builds shared, contracts, server, and the web UI
pnpm --filter @nightsmith/server exec nightsmith doctor   # check anvil/forge/cast + ports
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
pnpm --filter @nightsmith/server exec nightsmith serve
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
nightsmith serve              # start server + web cockpit
nightsmith stop               # stop the running localnet (talks to the server)
nightsmith doctor             # check toolchain + ports
nightsmith export <sessionId> [-o file.json]   # export a session's manifest
nightsmith replay <sessionId> # headlessly replay a saved session
```

Sessions are stored under `~/.nightsmith/sessions/<id>/` (manifest, report,
logs). Override with `NIGHTSMITH_DATA_DIR`.

## AI provider

The planner is selected **automatically by availability** — there is no manual
selection. The order is:

1. **OpenAI** — used if an OpenAI API key is set.
2. **Codex CLI** — used if `codex` is on your PATH (no key; reuses your existing
   Codex/ChatGPT login). Runs `codex exec` read-only, ephemeral, in a throwaway
   working dir, as a pure plan generator.
3. **Mock** — the deterministic, offline default; always available, no key/network.

The cockpit header's **AI** badge shows which provider is active; click it to see
the resolution. The only configuration is the OpenAI key, set via the
environment — Nightsmith never stores it on disk or accepts it through the UI:

- `OPENAI_API_KEY` — enables the OpenAI provider (in your `.env` or shell), then
  restart the server.
- Model: `NIGHTSMITH_OPENAI_MODEL` (default `gpt-5.5`).

The key is sent only to OpenAI when generating a plan — never logged, never
returned by the API. The log console shows which provider produced each plan
(e.g. "Plan generated via codex"). The provider only ever produces a reviewable
plan; the deterministic executor still runs it after validation and confirmation.

> **Note on "Sign in with ChatGPT":** OAuth login with a ChatGPT account does
> not grant access to the OpenAI API — API usage is billed separately and
> authenticated with an API key. (The Codex CLI's "Sign in with ChatGPT" is a
> product-specific flow, not a general API-OAuth.) Nightsmith therefore uses an
> API key, with the local "Connect" flow above to supply it at runtime.

## Configuration

| Env var | Default | Purpose |
| --- | --- | --- |
| `NIGHTSMITH_PORT` | `4040` | Server/UI port |
| `NIGHTSMITH_HOST` | `127.0.0.1` | Server bind address (set `0.0.0.0` for LAN — also set `NIGHTSMITH_ALLOWED_HOSTS`) |
| `NIGHTSMITH_ANVIL_PORT` | `8545` | Anvil RPC port |
| `NIGHTSMITH_ANVIL_HOST` | `127.0.0.1` | Anvil bind address (set `0.0.0.0` for LAN; the server still connects over loopback) |
| `NIGHTSMITH_WEB_PORT` | `4042` | Vite dev-server port (`pnpm dev:web`) |
| `NIGHTSMITH_WEB_HOST` | `127.0.0.1` | Vite dev-server bind address (set `0.0.0.0` or `true` for LAN) |
| `NIGHTSMITH_DATA_DIR` | `~/.nightsmith` | Session store location |
| `OPENAI_API_KEY` | — | OpenAI key (enables the OpenAI provider; overrides the stored key) |
| `NIGHTSMITH_OPENAI_MODEL` | `gpt-5.5` | OpenAI model for planning |
| `NIGHTSMITH_ALLOW_FORK` | `false` | Allow forking a remote chain |
| `NIGHTSMITH_ALLOW_BROADCAST` | `false` | Allow broadcasting beyond the local node |
| `NIGHTSMITH_ALLOWED_HOSTS` | — | Extra allowed `Host` values (comma-separated) beyond localhost |
| `NIGHTSMITH_ENV_FILE` | `./.env` | Path to the auto-loaded env file |

### Exposing services on the LAN

All three services bind to loopback by default. To reach them from another
machine, bind each to `0.0.0.0`:

```bash
# server (:4040) + Anvil (:8545)
NIGHTSMITH_HOST=0.0.0.0 \
NIGHTSMITH_ANVIL_HOST=0.0.0.0 \
NIGHTSMITH_ALLOWED_HOSTS=<your-lan-ip> \
  nightsmith serve

# Vite dev UI (:4042)
NIGHTSMITH_WEB_HOST=0.0.0.0 pnpm dev:web
```

`NIGHTSMITH_ALLOWED_HOSTS` is required when the server is reached by IP/hostname —
the Host-header guard rejects anything not in the allow-list (defends a bound
server against DNS-rebinding).

> ⚠️ `NIGHTSMITH_ANVIL_HOST=0.0.0.0` exposes a chain whose well-known test
> accounts are unlocked with no auth. Only do this on a trusted network.

See [SAFETY.md](SAFETY.md) for the safety model and [MANIFEST.md](MANIFEST.md)
for the manifest format.
