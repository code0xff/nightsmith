import { useCallback, useEffect, useRef, useState } from "react";
import { ChevronDown, FileCode2, FolderOpen, Lock, Trash2, Upload } from "lucide-react";
import { toast } from "sonner";
import type {
  ArtifactSummary,
  CompileArtifactRequest,
  InspectArtifactsResponse,
} from "@nightsmith/shared";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Dialog } from "@/components/ui/dialog";
import { api, ApiRequestError } from "@/lib/api";
import { cn } from "@/lib/utils";

type Mode = "json" | "source" | "zip";

/** One deployable contract detected by a single compile (inspect flow). */
type Candidate = InspectArtifactsResponse["contracts"][number];
const candidateKey = (c: Candidate) => `${c.sourceFile}::${c.artifact.name}`;
const functionCount = (abi: Candidate["artifact"]["abi"]) =>
  abi.filter((item) => (item as { type?: string }).type === "function").length;

/** Pull abi + 0x bytecode out of a pasted Foundry/Hardhat artifact (or {abi,bytecode}). */
function parseArtifact(json: string): { abi: unknown[]; bytecode: string } {
  const parsed = JSON.parse(json);
  const abi = Array.isArray(parsed) ? parsed : parsed.abi;
  // Foundry nests creation bytecode under bytecode.object; Hardhat uses a string.
  let bytecode = parsed?.bytecode;
  if (bytecode && typeof bytecode === "object") bytecode = bytecode.object;
  if (!Array.isArray(abi)) throw new Error("artifact JSON has no `abi` array");
  if (typeof bytecode !== "string" || !/^0x[0-9a-fA-F]+$/.test(bytecode) || bytecode.length <= 2) {
    throw new Error(
      "artifact has no usable creation `bytecode` (deployedBytecode is runtime code and can't be deployed)",
    );
  }
  return { abi, bytecode };
}

const sanitizeName = (s: string) => s.replace(/[^A-Za-z0-9_-]/g, "");

/** First `contract X {` name in a Solidity source, for a name/contract guess. */
function firstContractName(source: string): string | null {
  const m = source.match(/\bcontract\s+([A-Za-z_]\w*)/);
  return m ? m[1]! : null;
}

export function ContractsPanel({
  expanded,
  onToggle,
}: {
  expanded: boolean;
  onToggle: () => void;
}) {
  const [artifacts, setArtifacts] = useState<ArtifactSummary[]>([]);
  const [open, setOpen] = useState(false);
  const [mode, setMode] = useState<Mode>("json");
  const [name, setName] = useState("");
  const [json, setJson] = useState("");
  const [source, setSource] = useState("");
  const [path, setPath] = useState("");
  const [zipBase64, setZipBase64] = useState("");
  const [zipName, setZipName] = useState("");
  const [saving, setSaving] = useState(false);
  // Inspect flow (source/zip): detected deployable contracts + which are checked.
  const [candidates, setCandidates] = useState<Candidate[] | null>(null);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [detecting, setDetecting] = useState(false);
  const mounted = useRef(true);
  // Bumped on every input change; a detect() only applies its result if the
  // sequence is still current, so a stale in-flight compile can't resurrect
  // candidates for an input the user has since changed.
  const inspectSeq = useRef(0);
  const jsonRef = useRef<HTMLInputElement>(null);
  const solRef = useRef<HTMLInputElement>(null);
  const zipRef = useRef<HTMLInputElement>(null);

  /** Invalidate any detected candidates (input changed): drop them and bump the
   *  sequence so a detect() already in flight discards its result. */
  const invalidateCandidates = () => {
    inspectSeq.current += 1;
    setCandidates(null);
  };

  const onJsonFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = ""; // allow re-selecting the same file
    if (!file) return;
    const text = await file.text();
    if (!mounted.current) return;
    setJson(text);
    if (!name.trim()) {
      let guess = file.name.replace(/\.json$/i, "");
      try {
        const parsed = JSON.parse(text);
        if (typeof parsed?.contractName === "string") guess = parsed.contractName;
      } catch {
        // not JSON yet; fall back to the filename
      }
      setName(sanitizeName(guess));
    }
  };

  const onSolFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    invalidateCandidates();
    const text = await file.text();
    if (!mounted.current) return;
    setSource(text);
    const guess = firstContractName(text) ?? file.name.replace(/\.sol$/i, "");
    if (!name.trim()) setName(sanitizeName(guess));
  };

  const onZipFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    invalidateCandidates();
    const reader = new FileReader();
    reader.onload = () => {
      if (!mounted.current) return;
      const res = String(reader.result);
      setZipBase64(res.slice(res.indexOf(",") + 1)); // strip "data:...;base64,"
      setZipName(file.name);
      if (!name.trim()) setName(sanitizeName(file.name.replace(/\.zip$/i, "")));
    };
    reader.readAsDataURL(file);
  };

  const refresh = useCallback(async () => {
    try {
      const res = await api.getArtifacts();
      if (mounted.current) setArtifacts(res.artifacts);
    } catch {
      // keep last known list
    }
  }, []);

  useEffect(() => {
    mounted.current = true;
    refresh();
    return () => {
      mounted.current = false;
    };
  }, [refresh]);

  const reset = () => {
    setName("");
    setJson("");
    setSource("");
    setPath("");
    setZipBase64("");
    setZipName("");
    inspectSeq.current += 1; // discard any detect in flight
    setCandidates(null);
    setSelected(new Set());
  };

  const describeErr = (err: unknown) =>
    err instanceof ApiRequestError ? err.message : String(err);

  /** Upload an already-compiled JSON artifact (json mode). */
  const uploadJson = async () => {
    setSaving(true);
    try {
      const { abi, bytecode } = parseArtifact(json);
      const next = await api.uploadArtifact({ name: name.trim(), abi: abi as never, bytecode });
      if (!mounted.current) return;
      setArtifacts(next.artifacts);
      toast.success("Contract uploaded", { description: name.trim() });
      setOpen(false);
      reset();
    } catch (err) {
      toast.error("Upload failed", { description: describeErr(err) });
    } finally {
      if (mounted.current) setSaving(false);
    }
  };

  /** Build the source/project/zip once and list its deployable contracts. */
  const detect = async () => {
    const body: CompileArtifactRequest =
      mode === "zip" ? { zipBase64 } : path.trim() ? { path: path.trim() } : { source };
    const seq = (inspectSeq.current += 1);
    const current = () => mounted.current && seq === inspectSeq.current;
    setDetecting(true);
    try {
      const { contracts } = await api.inspectArtifacts(body);
      if (!current()) return; // input changed under us — discard this stale result
      if (contracts.length === 0) {
        toast.info("No deployable contracts found");
        return;
      }
      setCandidates(contracts);
      setSelected(new Set(contracts.map(candidateKey))); // default: all checked
    } catch (err) {
      if (current()) toast.error("Detect failed", { description: describeErr(err) });
    } finally {
      if (mounted.current) setDetecting(false);
    }
  };

  /** Register every checked candidate via the normal save endpoint. */
  const addSelected = async () => {
    if (!candidates) return;
    const chosen = candidates.filter((c) => selected.has(candidateKey(c)));
    if (chosen.length === 0) return;
    setSaving(true);
    let added = 0;
    const failures: string[] = [];
    for (const c of chosen) {
      try {
        await api.uploadArtifact(c.artifact);
        added++;
      } catch (err) {
        failures.push(`${c.artifact.name}: ${describeErr(err)}`);
      }
    }
    if (!mounted.current) return;
    if (added > 0) await refresh();
    if (failures.length === 0) {
      toast.success(`Added ${added} contract${added === 1 ? "" : "s"}`);
      setOpen(false);
      reset();
    } else {
      toast.error(`Added ${added}, ${failures.length} failed`, { description: failures.join("; ") });
    }
    if (mounted.current) setSaving(false);
  };

  const toggleCandidate = (key: string) =>
    setSelected((prev) => {
      const next = new Set(prev);
      next.has(key) ? next.delete(key) : next.add(key);
      return next;
    });

  const allSelected = Boolean(candidates && selected.size === candidates.length);
  const toggleAll = () =>
    setSelected(allSelected ? new Set() : new Set((candidates ?? []).map(candidateKey)));

  const remove = async (n: string) => {
    try {
      await api.deleteArtifact(n);
      toast.success("Contract removed", { description: n });
      refresh();
    } catch (err) {
      toast.error("Delete failed", {
        description: err instanceof Error ? err.message : String(err),
      });
    }
  };

  const canUploadJson = Boolean(name.trim() && json.trim());
  const canDetect =
    mode === "zip" ? Boolean(zipBase64) : Boolean(source.trim() || path.trim());
  const hasDuplicateNames = Boolean(
    candidates &&
      new Set(candidates.map((c) => c.artifact.name)).size !== candidates.length,
  );

  return (
    <>
      <Card className={cn("flex flex-col", expanded ? "min-h-0 flex-1" : "shrink-0")}>
        <CardHeader>
          <button
            type="button"
            onClick={onToggle}
            aria-expanded={expanded}
            className="flex min-w-0 flex-1 items-center gap-1.5 text-left text-sm font-medium leading-none tracking-tight"
          >
            <ChevronDown
              className={cn(
                "size-3.5 shrink-0 text-muted-foreground transition-transform",
                !expanded && "-rotate-90",
              )}
            />
            <FileCode2 className="size-3.5 text-muted-foreground" />
            Contracts
            <span className="text-xs font-normal text-muted-foreground">{artifacts.length}</span>
          </button>
          <Button variant="outline" onClick={() => setOpen(true)}>
            <Upload />
            Add
          </Button>
        </CardHeader>
        {expanded && (
          <CardContent className="min-h-0 space-y-1.5 overflow-y-auto scrollbar-thin">
            {artifacts.map((a) => (
            <div
              key={a.name}
              className="flex items-center justify-between gap-2 rounded-md border px-2 py-1.5"
            >
              <div className="min-w-0">
                <div className="truncate text-sm font-medium">{a.name}</div>
                <div className="truncate text-xs text-muted-foreground">
                  {a.builtin ? "built-in · " : ""}
                  {a.functions.length} function{a.functions.length === 1 ? "" : "s"}
                </div>
              </div>
              <Button
                variant="ghost"
                size="icon"
                aria-label={a.builtin ? `${a.name} is a built-in contract` : `Remove ${a.name}`}
                disabled={a.builtin}
                onClick={() => remove(a.name)}
              >
                {a.builtin ? <Lock /> : <Trash2 />}
              </Button>
            </div>
          ))}
          {artifacts.every((a) => a.builtin) && (
            <p className="text-xs text-muted-foreground">
              Add a contract — paste a <code>.sol</code>, point at a project, or upload a compiled
              artifact — then deploy it from a prompt: e.g. “Deploy MyVault with owner Alice and cap
              1000000”.
            </p>
          )}
          </CardContent>
        )}
      </Card>

      <Dialog
        open={open}
        onClose={() => !saving && setOpen(false)}
        title="Add a contract"
        description="Compile a Solidity source/project, or upload an already-compiled artifact."
      >
        <div className="space-y-2">
          <div className="flex gap-1 rounded-md border p-0.5">
            {(
              [
                ["source", "Solidity"],
                ["zip", "Project (.zip)"],
                ["json", "Compiled JSON"],
              ] as const
            ).map(([m, label]) => (
              <button
                key={m}
                type="button"
                onClick={() => {
                  setMode(m);
                  invalidateCandidates();
                }}
                className={cn(
                  "flex-1 rounded px-2 py-1 text-xs font-medium transition-colors",
                  mode === m
                    ? "bg-primary text-primary-foreground"
                    : "text-muted-foreground hover:bg-muted",
                )}
              >
                {label}
              </button>
            ))}
          </div>

          {mode === "json" && (
            <Input
              aria-label="Artifact name"
              placeholder="Name (e.g. MyVault)"
              value={name}
              onChange={(e) => setName(e.target.value)}
            />
          )}

          {mode === "json" && (
            <>
              <div className="flex items-center gap-2">
                <input
                  ref={jsonRef}
                  type="file"
                  accept=".json,application/json"
                  className="hidden"
                  onChange={onJsonFile}
                />
                <Button variant="outline" type="button" onClick={() => jsonRef.current?.click()}>
                  <FolderOpen />
                  Choose .json file
                </Button>
                <span className="text-xs text-muted-foreground">or paste below</span>
              </div>
              <Textarea
                aria-label="Compiled artifact JSON (abi + bytecode)"
                placeholder='{ "abi": [...], "bytecode": "0x..." }'
                value={json}
                onChange={(e) => setJson(e.target.value)}
                rows={8}
                className="font-mono text-xs"
              />
            </>
          )}

          {mode === "source" && (
            <>
              <div className="flex items-center gap-2">
                <input
                  ref={solRef}
                  type="file"
                  accept=".sol"
                  className="hidden"
                  onChange={onSolFile}
                />
                <Button variant="outline" type="button" onClick={() => solRef.current?.click()}>
                  <FolderOpen />
                  Choose .sol file
                </Button>
                <span className="text-xs text-muted-foreground">or paste below</span>
              </div>
              <Textarea
                aria-label="Solidity source"
                placeholder="// SPDX-License-Identifier: MIT&#10;pragma solidity ^0.8.20;&#10;contract MyVault { ... }"
                value={source}
                onChange={(e) => {
                  setSource(e.target.value);
                  invalidateCandidates();
                }}
                rows={8}
                className="font-mono text-xs"
              />
              <Input
                aria-label="Server-side path"
                placeholder="…or a server path to a .sol / Foundry project (imports resolve)"
                value={path}
                onChange={(e) => {
                  setPath(e.target.value);
                  invalidateCandidates();
                }}
                className="font-mono text-xs"
              />
            </>
          )}

          {mode === "zip" && (
            <div className="flex items-center gap-2">
              <input
                ref={zipRef}
                type="file"
                accept=".zip"
                className="hidden"
                onChange={onZipFile}
              />
              <Button variant="outline" type="button" onClick={() => zipRef.current?.click()}>
                <FolderOpen />
                Choose .zip project
              </Button>
              <span className="truncate text-xs text-muted-foreground">
                {zipName || "a Foundry project (with foundry.toml)"}
              </span>
            </div>
          )}

          {mode !== "json" && candidates && (
            <div className="max-h-52 space-y-1 overflow-y-auto rounded-md border p-2 scrollbar-thin">
              <div className="flex items-center justify-between text-xs text-muted-foreground">
                <span>{candidates.length} deployable contract{candidates.length === 1 ? "" : "s"}</span>
                <button type="button" className="hover:text-foreground" onClick={toggleAll}>
                  {allSelected ? "Clear all" : "Select all"}
                </button>
              </div>
              {candidates.map((c) => {
                const key = candidateKey(c);
                return (
                  <label
                    key={key}
                    className="flex cursor-pointer items-center gap-2 rounded px-1 py-0.5 text-sm hover:bg-muted"
                  >
                    <input
                      type="checkbox"
                      checked={selected.has(key)}
                      onChange={() => toggleCandidate(key)}
                    />
                    <span className="min-w-0 flex-1 truncate">
                      <span className="font-medium">{c.artifact.name}</span>
                      <span className="text-xs text-muted-foreground">
                        {" · "}
                        {c.sourceFile} · {functionCount(c.artifact.abi)} fn
                      </span>
                    </span>
                  </label>
                );
              })}
              {hasDuplicateNames && (
                <p className="text-xs text-warning">
                  Same-named contracts will overwrite each other when added.
                </p>
              )}
            </div>
          )}

          <p className="text-xs text-muted-foreground">
            {mode === "json" ? (
              <>
                Stored under <code>~/.nightsmith/artifacts</code>. Upload already-compiled bytecode.
              </>
            ) : (
              <>
                Compiled locally with <code>forge</code> and stored under{" "}
                <code>~/.nightsmith/artifacts</code>. Detect lists every deployable contract; check
                the ones to add. Imports/OpenZeppelin resolve for a project or zip; a pasted single
                file must be self-contained.
              </>
            )}
          </p>
          <div className="flex justify-end gap-2">
            <Button variant="ghost" onClick={() => setOpen(false)} disabled={saving}>
              Cancel
            </Button>
            {mode === "json" ? (
              <Button onClick={uploadJson} disabled={saving || !canUploadJson}>
                {saving ? "Uploading…" : "Upload"}
              </Button>
            ) : candidates ? (
              <>
                <Button variant="ghost" onClick={() => setCandidates(null)} disabled={saving}>
                  Back
                </Button>
                <Button onClick={addSelected} disabled={saving || selected.size === 0}>
                  {saving ? "Adding…" : `Add selected (${selected.size})`}
                </Button>
              </>
            ) : (
              <Button onClick={detect} disabled={detecting || !canDetect}>
                {detecting ? "Compiling…" : "Detect contracts"}
              </Button>
            )}
          </div>
        </div>
      </Dialog>
    </>
  );
}
