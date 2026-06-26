import type {
  ExecuteResponse,
  LocalnetAction,
  LocalnetActionResponse,
  Plan,
  PromptResponse,
  SessionDetail,
  SessionListResponse,
  WorldState,
} from "@blacksmith/shared";

export class ApiRequestError extends Error {
  readonly details?: string[];
  constructor(message: string, details?: string[]) {
    super(message);
    this.name = "ApiRequestError";
    this.details = details;
  }
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(path, {
    ...init,
    headers: { "content-type": "application/json", ...init?.headers },
  });
  const text = await res.text();
  const body = text ? JSON.parse(text) : {};
  if (!res.ok) {
    throw new ApiRequestError(body.error ?? `Request failed (${res.status})`, body.details);
  }
  return body as T;
}

export const api = {
  prompt: (prompt: string, sessionId?: string) =>
    request<PromptResponse>("/api/prompt", {
      method: "POST",
      body: JSON.stringify({ prompt, sessionId }),
    }),

  execute: (plan: Plan, planId?: string) =>
    request<ExecuteResponse>("/api/execute", {
      method: "POST",
      body: JSON.stringify({ plan, planId }),
    }),

  localnet: (action: LocalnetAction, snapshotId?: string) =>
    request<LocalnetActionResponse>("/api/localnet", {
      method: "POST",
      body: JSON.stringify({ action, snapshotId }),
    }),

  getLocalnet: () => request<WorldState>("/api/localnet"),

  sessions: () => request<SessionListResponse>("/api/sessions"),
  session: (id: string) => request<SessionDetail>(`/api/sessions/${id}`),
  deleteSession: (id: string) =>
    request<{ ok: boolean }>(`/api/sessions/${id}`, { method: "DELETE" }),
};
