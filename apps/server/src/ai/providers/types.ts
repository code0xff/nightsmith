import type { Plan, UploadedArtifact, WorldManifest } from "@nightsmith/shared";

export interface PlanInput {
  /** The user's natural-language request (already secret-scanned). */
  prompt: string;
  /** The most recently executed manifest, for modify/replay context. */
  previousManifest: WorldManifest | null;
  /** Whether a localnet is currently running. */
  running: boolean;
  /** Uploaded custom contracts available to deploy (name + abi). */
  artifacts: UploadedArtifact[];
}

/**
 * An AI provider converts intent into a reviewable Plan. Providers PLAN ONLY —
 * they never execute, never call RPC, and never receive private keys/secrets.
 */
export interface AiProvider {
  readonly name: string;
  /** `signal` cancels the underlying provider call (HTTP request / CLI subprocess). */
  generate(input: PlanInput, signal?: AbortSignal): Promise<Plan>;
}
