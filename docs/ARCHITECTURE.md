# Architecture

Nightsmith is a localhost web application with three runtime layers: a **web cockpit**, a **local server**, and a **deterministic executor** that drives a Foundry **Anvil** node. An **AI planner** sits in front of execution to translate natural language into reviewable manifests.

```
┌──────────────────────────── Browser ────────────────────────────┐
│  Web Cockpit (apps/web)                                          │
│  Prompt · Plan Preview · Localnet Status · World State           │
│  Log Console · Controls · Sessions · Replay/Export               │
└───────────────▲───────────────────────────▲────────────────────┘
        REST /api │                           │ WebSocket /ws
                  │                           │ (logs + state)
┌─────────────────┴───────────────────────────┴───────────────────┐
│  Local Server (apps/server) — Fastify on localhost:4040          │
│                                                                  │
│   AI Planner ──► Manifest ──► Safety Validator ──► Executor       │
│   (plans only)   (zod truth)   (local-only)        (viem+Anvil)   │
│                                                                  │
│   Session Store (file-based)   Anvil Process Manager             │
└───────────────────────────────────▲─────────────────────────────┘
                                     │ JSON-RPC (viem) / spawn (execa)
                              ┌──────┴───────┐
                              │  Anvil node  │
                              └──────────────┘
```

## Layers

### 1. Web Cockpit (`apps/web`)

Vite + React + shadcn/ui (neutral theme). Compact, monochrome, developer-tool styling. Talks to the server over REST for commands and a single WebSocket for live logs and world-state snapshots. The cockpit never talks to Anvil directly.

### 2. Local Server (`apps/server`)

Fastify server that:

- serves the built web UI,
- exposes a REST API (`prompt`, `execute`, `localnet`, `sessions`, `export`, `import`, `artifacts` incl. `artifacts/compile`),
- streams logs and state (and compile progress) over `/ws`,
- manages the Anvil process lifecycle,
- persists sessions, manifests, deployments, logs, reports, and compiled artifacts.

Also ships the `nightsmith` CLI (`serve`, `stop`, `compile`, `doctor`, `export`, `import`, `replay`, `clean`) as a launcher/automation layer.

### 3. AI Planner (`apps/server/src/ai`)

Converts natural language into a structured, reviewable **plan**. It **does not execute** anything. It exposes a provider interface with four backends — **OpenAI** (HTTP), the **Codex CLI**, the **Claude Code CLI**, and a deterministic offline **mock** — selected automatically by availability or pinned via `NIGHTSMITH_AI_PROVIDER`. The planner never receives private keys or secrets.

### 4. Manifest (`packages/shared`)

The generated manifest (validated by zod) is the **internal source of truth**. A manifest fully describes a world: network, named accounts, contracts, actions, and assertions. Manifests are exportable for replay, CI, or sharing. Users are never required to hand-edit them.

### 5. Safety Validator (`apps/server/src/safety`)

Enforces local-only execution, rejects public-network broadcasting unless explicitly configured, blocks secrets/private keys, and validates every manifest before execution. Execution always requires explicit user confirmation.

### 6. Executor (`apps/server/src/executor`)

Deterministic engine using **viem** for RPC and **execa** for process spawning. It starts/stops Anvil (with a fixed genesis + block interval so time is reproducible), creates and funds named accounts, deploys contracts (the precompiled MockERC20, or user contracts as inlined artifacts), mints/transfers/approves tokens, calls functions (signing as a named account or impersonating an address), advances time/blocks, evaluates assertions (balances, allowances, ETH, call results, emitted events), and emits log/state events. User Solidity is compiled to an artifact by a separate **compile** step (`artifacts/compile.ts`, `forge build`), so the executor itself never runs `solc`.

### 7. Session Store (`apps/server/src/sessions`)

File-based store under `~/.nightsmith/sessions/<id>/` holding the manifest, deployments, logs, and report. Enables resume, replay, export, and deletion.

## Data flow (demo)

1. User submits a prompt in the cockpit.
2. Server's planner returns a plan + manifest; the cockpit shows a **preview**.
3. User confirms **Run**.
4. Safety validator checks the manifest.
5. Executor starts Anvil, funds accounts, deploys MockUSDC, mints, transfers, asserts.
6. Logs and state stream to the cockpit over `/ws` in real time.
7. The session (manifest + logs + report) is saved and becomes replayable.

## Key decisions

- **Precompiled built-in, runtime-compiled user contracts**: `packages/contracts` ships `MockERC20.sol` plus a committed bytecode/ABI JSON (deployed via viem, no runtime `solc`). Bring-your-own contracts are compiled on demand with `forge build` (a `.sol` file, a Foundry project, or a `.zip`) and inlined into the manifest as an artifact — so the compile happens once and replay/import stay `forge`-free and deterministic.
- **Single WebSocket**: logs and state snapshots are multiplexed over one `/ws` connection to keep the client simple.
- **Shared schemas**: all manifest/event/API shapes live in `packages/shared` and are validated with zod at every boundary.
