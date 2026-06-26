# Safety model

Nightsmith runs untrusted, AI-generated intent against a blockchain node. The
safety model keeps that local, reviewable, and free of secrets. The rules below
are enforced in code (`apps/server/src/safety/`), not just documented.

## Principles

1. **Local-only by default.** The only network kind is `anvil-local`. Forking a
   remote chain or broadcasting beyond the local node is rejected unless you
   explicitly opt in (`NIGHTSMITH_ALLOW_FORK=true` / `NIGHTSMITH_ALLOW_BROADCAST=true`).
   — `safety/validateNetwork.ts`
2. **No secrets reach the AI.** User prompts are scanned for private keys, PEM
   blocks, and common API-key shapes before any provider call; matches are
   rejected. — `safety/validateSecrets.ts`
3. **No private keys, ever.** Nightsmith never asks for or stores a private key.
   Local execution uses only Anvil's well-known **public** test accounts. Custom
   mnemonics are rejected, and anything resembling a private key in Anvil's
   output is redacted before it reaches the logs.
4. **Review before execution.** The planner only *plans*. Every generated plan
   is shown as a preview and must be confirmed before the deterministic executor
   runs it. The plan is re-validated (shape + semantics + network) at execution
   time — including replayed/resumed sessions loaded from disk. — `safety/validatePlan.ts`
5. **Everything is saved and reproducible.** Each run persists its manifest,
   report, and logs to `~/.nightsmith/sessions/<id>/`, so any world can be
   inspected, replayed, exported, or deleted.
6. **Mock tokens by default.** Named assets (USDC, DAI, WETH) become a local
   `MockERC20`. A real/mainnet token would require explicit fork configuration.

## Defense in depth

- **Schema validation** (zod) at every boundary: prompt input, planner output,
  manifest load, REST bodies.
- **Semantic validation**: actions/assertions must reference declared
  accounts/contracts; no duplicate ids.
- **Concurrency safety**: execute and localnet-control requests are serialized
  through a runtime mutex so two requests can't race Anvil process ownership.
- **Path safety**: session ids are validated against a strict pattern before
  being used in filesystem paths.
- **Revert handling**: a reverted deploy/mint/transfer fails the step loudly
  rather than being silently treated as success.

## Opt-in escapes (use deliberately)

| Env var | Effect |
| --- | --- |
| `NIGHTSMITH_ALLOW_FORK=true` | Permit `network.forkUrl` (fork a remote chain) |
| `NIGHTSMITH_ALLOW_BROADCAST=true` | Permit `network.broadcast` beyond the local node |
| `NIGHTSMITH_AI_PROVIDER=openai` | Use the OpenAI provider instead of the mock (needs `OPENAI_API_KEY` or the cockpit Connect flow; anthropic remains a stub) |

These exist for advanced, deliberate use. The defaults are local-only and
secret-free.
