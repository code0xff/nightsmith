import { useCallback, useEffect, useRef, useState } from "react";
import { ChevronDown, FileCode2, FolderOpen, Lock, Trash2, Upload } from "lucide-react";
import { toast } from "sonner";
import type { ArtifactSummary, CompileArtifactRequest } from "@nightsmith/shared";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Dialog } from "@/components/ui/dialog";
import { api, ApiRequestError } from "@/lib/api";
import { cn } from "@/lib/utils";

type Mode = "json" | "source" | "zip";

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
  const [contractName, setContractName] = useState("");
  const [json, setJson] = useState("");
  const [source, setSource] = useState("");
  const [path, setPath] = useState("");
  const [zipBase64, setZipBase64] = useState("");
  const [zipName, setZipName] = useState("");
  const [saving, setSaving] = useState(false);
  const mounted = useRef(true);
  const jsonRef = useRef<HTMLInputElement>(null);
  const solRef = useRef<HTMLInputElement>(null);
  const zipRef = useRef<HTMLInputElement>(null);

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
    setContractName("");
    setJson("");
    setSource("");
    setPath("");
    setZipBase64("");
    setZipName("");
  };

  const submit = async () => {
    setSaving(true);
    try {
      let next;
      if (mode === "json") {
        const { abi, bytecode } = parseArtifact(json);
        next = await api.uploadArtifact({ name: name.trim(), abi: abi as never, bytecode });
      } else {
        const common = {
          name: name.trim() || undefined,
          contractName: contractName.trim() || undefined,
        };
        const body: CompileArtifactRequest =
          mode === "zip"
            ? { ...common, zipBase64 }
            : path.trim()
              ? { ...common, path: path.trim() }
              : { ...common, source };
        next = await api.compileArtifact(body);
      }
      if (!mounted.current) return;
      setArtifacts(next.artifacts);
      toast.success(mode === "json" ? "Contract uploaded" : "Contract compiled", {
        description: name.trim() || contractName.trim() || undefined,
      });
      setOpen(false);
      reset();
    } catch (err) {
      toast.error(mode === "json" ? "Upload failed" : "Compile failed", {
        description: err instanceof ApiRequestError ? err.message : String(err),
      });
    } finally {
      if (mounted.current) setSaving(false);
    }
  };

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

  const canSubmit =
    mode === "json"
      ? Boolean(name.trim() && json.trim())
      : mode === "zip"
        ? Boolean(zipBase64)
        : Boolean(source.trim() || path.trim());

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
                onClick={() => setMode(m)}
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

          <Input
            aria-label="Artifact name"
            placeholder={
              mode === "json" ? "Name (e.g. MyVault)" : "Name (optional — defaults to the contract)"
            }
            value={name}
            onChange={(e) => setName(e.target.value)}
          />
          {mode !== "json" && (
            <Input
              aria-label="Contract name to select"
              placeholder="Contract to select (needed if the file/project has several)"
              value={contractName}
              onChange={(e) => setContractName(e.target.value)}
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
                onChange={(e) => setSource(e.target.value)}
                rows={8}
                className="font-mono text-xs"
              />
              <Input
                aria-label="Server-side path"
                placeholder="…or a server path to a .sol / Foundry project (imports resolve)"
                value={path}
                onChange={(e) => setPath(e.target.value)}
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

          <p className="text-xs text-muted-foreground">
            {mode === "json" ? (
              <>
                Stored under <code>~/.nightsmith/artifacts</code>. Upload already-compiled bytecode.
              </>
            ) : (
              <>
                Compiled locally with <code>forge</code> and stored under{" "}
                <code>~/.nightsmith/artifacts</code>. Imports/OpenZeppelin resolve for a project or
                zip; a pasted single file must be self-contained.
              </>
            )}
          </p>
          <div className="flex justify-end gap-2">
            <Button variant="ghost" onClick={() => setOpen(false)} disabled={saving}>
              Cancel
            </Button>
            <Button onClick={submit} disabled={saving || !canSubmit}>
              {saving
                ? mode === "json"
                  ? "Uploading…"
                  : "Compiling…"
                : mode === "json"
                  ? "Upload"
                  : "Compile"}
            </Button>
          </div>
        </div>
      </Dialog>
    </>
  );
}
