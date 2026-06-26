import { useCallback, useEffect, useRef, useState } from "react";
import { FileCode2, Trash2, Upload } from "lucide-react";
import { toast } from "sonner";
import type { ArtifactSummary } from "@nightsmith/shared";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Dialog } from "@/components/ui/dialog";
import { api, ApiRequestError } from "@/lib/api";

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

export function ContractsPanel() {
  const [artifacts, setArtifacts] = useState<ArtifactSummary[]>([]);
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [json, setJson] = useState("");
  const [saving, setSaving] = useState(false);
  const mounted = useRef(true);

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

  const upload = async () => {
    setSaving(true);
    try {
      const { abi, bytecode } = parseArtifact(json);
      const next = await api.uploadArtifact({ name: name.trim(), abi: abi as never, bytecode });
      if (!mounted.current) return;
      setArtifacts(next.artifacts);
      toast.success("Contract uploaded", { description: name.trim() });
      setOpen(false);
      setName("");
      setJson("");
    } catch (err) {
      toast.error("Upload failed", {
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

  return (
    <>
      <Card className="flex min-h-0 flex-col">
        <CardHeader>
          <CardTitle>
            <FileCode2 className="size-3.5 text-muted-foreground" />
            Contracts
          </CardTitle>
          <Button variant="outline" onClick={() => setOpen(true)}>
            <Upload />
            Upload
          </Button>
        </CardHeader>
        <CardContent className="min-h-0 space-y-1.5 overflow-y-auto scrollbar-thin">
          {artifacts.length === 0 ? (
            <p className="text-xs text-muted-foreground">
              No uploaded contracts. Upload an artifact (ABI + bytecode), then deploy it from a
              prompt: e.g. “Deploy MyVault with owner Alice and cap 1000000”.
            </p>
          ) : (
            artifacts.map((a) => (
              <div
                key={a.name}
                className="flex items-center justify-between gap-2 rounded-md border px-2 py-1.5"
              >
                <div className="min-w-0">
                  <div className="truncate text-sm font-medium">{a.name}</div>
                  <div className="truncate text-xs text-muted-foreground">
                    {a.functions.length} function{a.functions.length === 1 ? "" : "s"}
                  </div>
                </div>
                <Button
                  variant="ghost"
                  size="icon"
                  aria-label={`Remove ${a.name}`}
                  onClick={() => remove(a.name)}
                >
                  <Trash2 />
                </Button>
              </div>
            ))
          )}
        </CardContent>
      </Card>

      <Dialog
        open={open}
        onClose={() => !saving && setOpen(false)}
        title="Upload a contract"
        description="Paste a compiled artifact (Foundry/Hardhat) or a { abi, bytecode } JSON."
      >
        <div className="space-y-2">
          <Input
            aria-label="Contract name"
            placeholder="Name (e.g. MyVault)"
            value={name}
            onChange={(e) => setName(e.target.value)}
          />
          <Textarea
            aria-label="Compiled artifact JSON (abi + bytecode)"
            placeholder='{ "abi": [...], "bytecode": "0x..." }'
            value={json}
            onChange={(e) => setJson(e.target.value)}
            rows={8}
            className="font-mono text-xs"
          />
          <p className="text-xs text-muted-foreground">
            Stored locally under <code>~/.nightsmith/artifacts</code>. No runtime compilation —
            upload already-compiled bytecode.
          </p>
          <div className="flex justify-end gap-2">
            <Button variant="ghost" onClick={() => setOpen(false)} disabled={saving}>
              Cancel
            </Button>
            <Button onClick={upload} disabled={saving || !name.trim() || !json.trim()}>
              {saving ? "Uploading…" : "Upload"}
            </Button>
          </div>
        </div>
      </Dialog>
    </>
  );
}
