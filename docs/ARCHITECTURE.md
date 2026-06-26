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
- exposes a REST API (`prompt`, `execute`, `localnet`, `sessions`, `export`),
- streams logs and state over `/ws`,
- manages the Anvil process lifecycle,
- persists sessions, manifests, deployments, logs, and reports.

Also ships the `nightsmith` CLI (`serve`, `stop`, `export`, `replay`, `doctor`) as a launcher/automation layer.

### 3. AI Planner (`apps/server/src/ai`)

Converts natural language into a structured, reviewable **plan**. It **does not execute** anything. It supports a provider interface; the MVP ships a deterministic **mock** provider plus `openai`/`anthropic` stubs. The planner never receives private keys or secrets.

### 4. Manifest (`packages/shared`)

The generated manifest (validated by zod) is the **internal source of truth**. A manifest fully describes a world: network, named accounts, contracts, actions, and assertions. Manifests are exportable for replay, CI, or sharing. Users are never required to hand-edit them.

### 5. Safety Validator (`apps/server/src/safety`)

Enforces local-only execution, rejects public-network broadcasting unless explicitly configured, blocks secrets/private keys, and validates every manifest before execution. Execution always requires explicit user confirmation.

### 6. Executor (`apps/server/src/executor`)

Deterministic engine using **viem** for RPC and **execa** for process spawning. It starts/stops Anvil, creates and funds named accounts, deploys contracts from the precompiled artifact, mints/transfers tokens, runs scenarios, evaluates assertions, and emits log/state events.

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

- **Precompiled contract artifact**: `packages/contracts` ships `MockERC20.sol` plus a committed bytecode/ABI JSON; the executor deploys via viem with no `solc` at runtime — fast and deterministic.
- **Single WebSocket**: logs and state snapshots are multiplexed over one `/ws` connection to keep the client simple.
- **Shared schemas**: all manifest/event/API shapes live in `packages/shared` and are validated with zod at every boundary.
