import { z } from "zod";
import {
  AiStatus,
  AnvilStatus,
  ArtifactListResponse,
  ExecuteResponse,
  LocalnetActionResponse,
  PromptResponse,
  SessionDetail,
  SessionListResponse,
  type CompileArtifactRequest,
  type LocalnetAction,
  type Plan,
  type UploadedArtifact,
  type WorldManifest,
} from "@nightsmith/shared";

export class ApiRequestError extends Error {
  readonly details?: string[];
  constructor(message: string, details?: string[]) {
    super(message);
    this.name = "ApiRequestError";
    this.details = details;
  }
}

const OkResponse = z.object({ ok: z.boolean() });

async function request<S extends z.ZodTypeAny>(
  path: string,
  schema: S,
  init?: RequestInit,
): Promise<z.infer<S>> {
  // Only declare a JSON content-type when we actually send a body — otherwise
  // Fastify rejects a bodyless POST (e.g. install/disconnect/resume) as an
  // "empty JSON body".
  const headers: Record<string, string> = {
    ...(init?.body != null ? { "content-type": "application/json" } : {}),
    ...(init?.headers as Record<string, string> | undefined),
  };
  const res = await fetch(path, { ...init, headers });
  const text = await res.text();
  const body = text ? JSON.parse(text) : {};
  if (!res.ok) {
    throw new ApiRequestError(body.error ?? `Request failed (${res.status})`, body.details);
  }
  // Validate the server's shape so an unexpected response is a typed error,
  // not a render-time crash deep in a component.
  const parsed = schema.safeParse(body);
  if (!parsed.success) {
    throw new ApiRequestError(
      "Unexpected response from server",
      parsed.error.issues.map((i) => `${i.path.join(".") || "(root)"}: ${i.message}`),
    );
  }
  return parsed.data;
}

export const api = {
  prompt: (prompt: string, sessionId?: string, signal?: AbortSignal) =>
    request("/api/prompt", PromptResponse, {
      method: "POST",
      body: JSON.stringify({ prompt, sessionId }),
      signal,
    }),

  execute: (plan: Plan, planId?: string, baseSessionId?: string, prompt?: string) =>
    request("/api/execute", ExecuteResponse, {
      method: "POST",
      body: JSON.stringify({ plan, planId, baseSessionId, prompt }),
    }),

  localnet: (action: LocalnetAction) =>
    request("/api/localnet", LocalnetActionResponse, {
      method: "POST",
      body: JSON.stringify({ action }),
    }),

  importManifest: (manifest: WorldManifest) =>
    request("/api/import", ExecuteResponse, {
      method: "POST",
      body: JSON.stringify({ manifest }),
    }),

  sessions: () => request("/api/sessions", SessionListResponse),
  session: (id: string) => request(`/api/sessions/${id}`, SessionDetail),
  deleteSession: (id: string) =>
    request(`/api/sessions/${id}`, OkResponse, { method: "DELETE" }),

  getAnvil: () => request("/api/anvil", AnvilStatus),
  installAnvil: (token: string) =>
    request("/api/anvil/install", AnvilStatus, {
      method: "POST",
      headers: { "x-nightsmith-install-token": token },
    }),

  getArtifacts: () => request("/api/artifacts", ArtifactListResponse),
  uploadArtifact: (body: UploadedArtifact) =>
    request("/api/artifacts", ArtifactListResponse, {
      method: "POST",
      body: JSON.stringify(body),
    }),
  compileArtifact: (body: CompileArtifactRequest) =>
    request("/api/artifacts/compile", ArtifactListResponse, {
      method: "POST",
      body: JSON.stringify(body),
    }),
  deleteArtifact: (name: string) =>
    request(`/api/artifacts/${encodeURIComponent(name)}`, OkResponse, { method: "DELETE" }),

  getAi: () => request("/api/ai", AiStatus),
};
