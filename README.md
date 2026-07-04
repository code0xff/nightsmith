# Nightsmith 🔨

> A prompt-driven local blockchain cockpit for Foundry Anvil.

Nightsmith turns developer intent into a running local blockchain world. Describe what you want to test in plain language — Nightsmith converts it into a reviewable execution manifest, validates it, previews it, runs it on a local Anvil node, and streams logs and state to a professional web cockpit. Every world is inspectable, replayable, and exportable.

```
"Create a local USDC payment test world. Alice should have 1000 USDC,
 Bob should have 100 USDC, then Alice sends Bob 10 USDC and the final
 balance should be verified."
        │
        ▼   AI Planner  → reviewable execution plan (manifest)
        ▼   Safety Validator  → local-only, no secrets, confirmed
        ▼   Executor (viem + Anvil)  → deploy MockUSDC, mint, transfer, assert
        ▼   Web cockpit  → live logs, world state, replay & export
```

## Why

Local devnet setup means hand-writing YAML, shell scripts, and deploy code. Nightsmith makes **natural language the interface** and a **generated manifest the source of truth** — so you describe intent, review the plan, and get a deterministic, replayable world.

## What you can do

Describe a world in plain language; Nightsmith plans, confirms, and runs it:

- **Tokens** — mock USDC/DAI/WETH (MockERC20) with mint, transfer, `approve`,
  and balance / allowance assertions.
- **Your own contracts** — **compile Solidity at runtime** (a `.sol` file, a
  Foundry project, or a `.zip` — with `node_modules`/OpenZeppelin imports), or
  upload a precompiled artifact; then deploy (constructor args incl. structs),
  call any function, and verify results and **emitted events**.
- **Native ETH** — set an account's starting balance and assert exact ETH.
- **Time & blocks** — advance time and mine blocks for vesting / timelock tests
  (block time is deterministic, so replays reproduce exactly).
- **Impersonation** — send a tx *as* an arbitrary address (act as a user, or a
  whale on a fork).
- **Inspect · replay · export** — every world is saved, reproducible, and
  portable.

## Quick start

```bash
pnpm install
pnpm build
pnpm --filter @nightsmith/server exec nightsmith doctor   # check toolchain
pnpm --filter @nightsmith/server exec nightsmith serve     # http://localhost:4040
```

Headless demo (no browser):

```bash
pnpm demo
```

## Docs

- [docs/USAGE.md](docs/USAGE.md) — install, run, prompts, CLI, dev, configuration
- [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) — layers and data flow
- [docs/MANIFEST.md](docs/MANIFEST.md) — the World manifest format
- [docs/CUSTOM_CONTRACTS.md](docs/CUSTOM_CONTRACTS.md) — upload & deploy your own contracts
- [docs/SAFETY.md](docs/SAFETY.md) — the safety model
- [CLAUDE.md](CLAUDE.md) — working guidance for contributors and agents

## Requirements

- Node.js ≥ 20, pnpm ≥ 11
- [Foundry](https://book.getfoundry.sh/) (`anvil`, `forge`, `cast`) on `PATH` —
  or let the cockpit install it for you on first run (consented, macOS/Linux)

## Safety

Nightsmith executes **locally only** by default. It never broadcasts to public networks without explicit configuration, never sends private keys to AI providers, and requires confirmation before running any generated plan. See [docs/SAFETY.md](docs/SAFETY.md).

## License

MIT
