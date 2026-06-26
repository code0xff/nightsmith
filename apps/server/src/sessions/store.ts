import {
  existsSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { join } from "node:path";
import type {
  ExecutionReport,
  SessionDetail,
  SessionSummary,
  WorldManifest,
} from "@nightsmith/shared";
import { AppError } from "../utils/errors.js";
import { ensureDir, sessionDir, sessionsDir } from "../utils/paths.js";
import { reportToMarkdown } from "./report.js";

const SAFE_ID = /^[A-Za-z0-9_-]+$/;

/** Reject session ids that could escape the sessions directory. */
function assertSafeId(id: string): string {
  if (!SAFE_ID.test(id)) {
    throw new AppError(`Invalid session id "${id}"`, 400);
  }
  return id;
}

function slugify(name: string): string {
  return (
    name
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 32) || "world"
  );
}

/** Generate a new, sortable session id from a world name. */
export function newSessionId(name: string): string {
  return `${slugify(name)}-${Date.now().toString(36)}`;
}

const metaPath = (id: string) => join(sessionDir(assertSafeId(id)), "meta.json");
const manifestPath = (id: string) => join(sessionDir(assertSafeId(id)), "manifest.json");
const reportPath = (id: string) => join(sessionDir(assertSafeId(id)), "report.json");

function readJson<T>(path: string): T {
  return JSON.parse(readFileSync(path, "utf8")) as T;
}

/** Persist a session's manifest, optional report, and summary metadata. */
export function saveSession(args: {
  id: string;
  manifest: WorldManifest;
  report?: ExecutionReport | null;
}): SessionSummary {
  const dir = ensureDir(sessionDir(assertSafeId(args.id)));
  const now = new Date().toISOString();

  let createdAt = now;
  if (existsSync(metaPath(args.id))) {
    createdAt = readJson<SessionSummary>(metaPath(args.id)).createdAt;
  }

  const summary: SessionSummary = {
    id: args.id,
    name: args.manifest.name,
    createdAt,
    updatedAt: now,
    lastRunStatus: args.report ? args.report.status : "none",
  };

  writeFileSync(join(dir, "manifest.json"), JSON.stringify(args.manifest, null, 2) + "\n");
  if (args.report) {
    writeFileSync(reportPath(args.id), JSON.stringify(args.report, null, 2) + "\n");
    writeFileSync(join(dir, "report.md"), reportToMarkdown(args.report, args.manifest));
  }
  writeFileSync(metaPath(args.id), JSON.stringify(summary, null, 2) + "\n");
  return summary;
}

export function getSession(id: string): SessionDetail {
  if (!existsSync(metaPath(id))) {
    throw new AppError(`Session "${id}" not found`, 404);
  }
  return {
    summary: readJson<SessionSummary>(metaPath(id)),
    manifest: readJson<WorldManifest>(manifestPath(id)),
    report: existsSync(reportPath(id)) ? readJson<ExecutionReport>(reportPath(id)) : null,
  };
}

export function listSessions(): SessionSummary[] {
  const root = sessionsDir();
  if (!existsSync(root)) return [];
  const ids = readdirSync(root, { withFileTypes: true })
    .filter((d) => d.isDirectory())
    .map((d) => d.name);
  const summaries: SessionSummary[] = [];
  for (const id of ids) {
    try {
      summaries.push(readJson<SessionSummary>(metaPath(id)));
    } catch {
      // Skip corrupt/partial session dirs.
    }
  }
  return summaries.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
}

export function latestSession(): SessionSummary | null {
  return listSessions()[0] ?? null;
}

export function deleteSession(id: string): void {
  const dir = sessionDir(assertSafeId(id));
  if (!existsSync(dir)) throw new AppError(`Session "${id}" not found`, 404);
  rmSync(dir, { recursive: true, force: true });
}

// Ensure the sessions root exists eagerly so first writes don't race.
mkdirSync(sessionsDir(), { recursive: true });
