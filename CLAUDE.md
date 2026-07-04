# CLAUDE.md — Nightsmith

Guidance for working in this repository.

## What this is

**Nightsmith** is an AI-native local blockchain cockpit for **Foundry Anvil**. Developers describe a test world in natural language; Nightsmith converts intent into a reviewable execution **manifest**, validates it for safety, previews it, executes it on a local Anvil node, and streams logs/state to a web UI. The resulting world is inspectable, replayable, and exportable.

Mental model:

- **Natural language is the UI.**
- **The generated manifest is the internal source of truth.**
- **Anvil is the local execution backend.**
- **The AI plans; the deterministic executor runs.**

## Monorepo layout

```
apps/
  web/        # Vite + React + shadcn/ui cockpit (primary UX)
  server/     # Fastify local server + CLI (`nightsmith`)
packages/
  shared/     # zod schemas + types (manifest, events, api) — single source of truth
  contracts/  # MockERC20.sol source + precompiled bytecode/ABI artifact
```

## Commands

```bash
pnpm install          # install workspace deps
pnpm build            # build all packages (pnpm -r build)
pnpm typecheck        # typecheck all packages
pnpm dev              # run the local server in watch mode
pnpm dev:web          # run the web dev server (proxies /api,/ws to server)
pnpm demo             # headless demo: prompt -> plan -> execute, asserts Bob = 110 USDC
pnpm test             # vitest (server compile-security + happy-path suite)
```

CLI (from `apps/server`, exposed as `nightsmith`):

```bash
nightsmith serve      # start server + serve web UI on http://localhost:4040
nightsmith stop       # stop a running localnet
nightsmith compile    # compile a .sol / Foundry project with forge and store it
nightsmith export     # export a session manifest
nightsmith import     # import a manifest file and replay it
nightsmith replay     # replay a saved session
nightsmith doctor     # check anvil/forge/cast availability and ports
nightsmith clean      # delete all saved sessions + uploaded contracts
```

## Conventions

- TypeScript everywhere, ESM (`"type": "module"`), `strict` on.
- `packages/shared` is the **only** place to define manifest/event/API shapes. Import from `@nightsmith/shared`; never duplicate a type.
- All cross-boundary data is validated with **zod** at the edge (route handlers, planner output, manifest load).
- The executor is **deterministic**: same manifest → same world. No randomness, no wall-clock branching. Local block timestamps are a pure function of block height (fixed genesis + per-block interval), so time-dependent worlds (`mine`) replay identically.
- The built-in **MockERC20** deploys from a **precompiled artifact** in `packages/contracts` via viem (no runtime solc). User contracts are **compiled at runtime with `forge build`** (`apps/server/src/artifacts/compile.ts`) into the same `artifact` shape (abi+bytecode inlined into the manifest, so replay/import never need the source or `forge`). Compilation is `forge build` only — never `test`/`script`/`ffi`; untrusted zips are sandboxed (writes confined, no compiler-by-path, `.env` stripped, size/symlink guards).
- Commits are small, buildable units with conventional-commit prefixes (`feat`, `fix`, `chore`, `docs`).

## Safety rules (non-negotiable)

- Default execution target is **local Anvil only**. Public-network broadcasting is rejected unless an explicit `forkUrl`/broadcast config is set.
- **Never** send private keys to an AI provider; **never** ask the user for private keys. Only Anvil's well-known public test accounts are used.
- Every AI-generated plan is validated (zod + safety) and requires **user confirmation** before execution.
- Every generated plan is saved; every execution is reproducible.
- Named assets (USDC, DAI, WETH) default to **MockERC20**. Real/mainnet tokens require explicit fork configuration.

## Anvil test accounts

Anvil's deterministic mnemonic yields 10 dev accounts. Nightsmith maps named accounts by index: `0 = deployer`, `1 = Alice`, `2 = Bob`. These are **public, well-known test keys** — not secrets.
