import { z } from "zod";
import {
  AiStatus,
  ExecuteResponse,
  LocalnetActionResponse,
  PromptResponse,
  SessionDetail,
  SessionListResponse,
  type AiConnectRequest,
  type LocalnetAction,
  type Plan,
} from "@blacksmith/shared";

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
  const res = await fetch(path, {
    ...init,
    headers: { "content-type": "application/json", ...init?.headers },
  });
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
  prompt: (prompt: string, sessionId?: string) =>
    request("/api/prompt", PromptResponse, {
      method: "POST",
      body: JSON.stringify({ prompt, sessionId }),
    }),

  execute: (plan: Plan, planId?: string) =>
    request("/api/execute", ExecuteResponse, {
      method: "POST",
      body: JSON.stringify({ plan, planId }),
    }),

  localnet: (action: LocalnetAction, snapshotId?: string) =>
    request("/api/localnet", LocalnetActionResponse, {
      method: "POST",
      body: JSON.stringify({ action, snapshotId }),
    }),

  sessions: () => request("/api/sessions", SessionListResponse),
  session: (id: string) => request(`/api/sessions/${id}`, SessionDetail),
  deleteSession: (id: string) =>
    request(`/api/sessions/${id}`, OkResponse, { method: "DELETE" }),

  getAi: () => request("/api/ai", AiStatus),
  aiConnect: (body: AiConnectRequest) =>
    request("/api/ai/connect", AiStatus, { method: "POST", body: JSON.stringify(body) }),
  aiDisconnect: () => request("/api/ai/disconnect", AiStatus, { method: "POST" }),
};
