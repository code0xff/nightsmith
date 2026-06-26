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

## Status

MVP in progress. The first supported flow is the USDC payment demo above.

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
