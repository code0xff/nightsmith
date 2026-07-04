import { execa } from "execa";
import {
  cpSync,
  existsSync,
  mkdtempSync,
  readFileSync,
  readlinkSync,
  readdirSync,
  rmSync,
  statSync,
  writeFileSync,
} from "node:fs";
import { basename, dirname, isAbsolute, join, resolve, sep } from "node:path";
import type { CompileArtifactRequest, UploadedArtifact } from "@nightsmith/shared";
import { locateForge } from "../anvil/locate.js";
import { AppError } from "../utils/errors.js";
import { dataDir, ensureDir } from "../utils/paths.js";

const FORGE_TIMEOUT_MS = 300_000; // first compile may download a solc via svm

// Zip upload limits (defense against zip bombs / disk exhaustion).
const MAX_ZIP_BYTES = 25 * 1024 * 1024; // decoded archive
const MAX_UNZIPPED_BYTES = 200 * 1024 * 1024; // total uncompressed
const MAX_ZIP_ENTRIES = 4000;

// ── forge availability (cached, mirrors anvil/preflight) ─────────────────────

const TTL_MS = 30_000;
let forgeCache: { ok: boolean; checkedAt: number } | null = null;

export const FORGE_INSTALL_HINT =
  "forge (Foundry) is not installed or not on PATH. Install it from " +
  "https://book.getfoundry.sh/getting-started/installation and run `foundryup`.";

export async function isForgeInstalled(): Promise<boolean> {
  if (forgeCache && Date.now() - forgeCache.checkedAt < TTL_MS) return forgeCache.ok;
  let ok = false;
  try {
    await execa(locateForge(), ["--version"], { timeout: 5000 });
    ok = true;
  } catch {
    ok = false;
  }
  forgeCache = { ok, checkedAt: Date.now() };
  return ok;
}

async function assertForgeInstalled(): Promise<void> {
  if (!(await isForgeInstalled())) throw new AppError(FORGE_INSTALL_HINT, 503);
}

// ── forge invocations ────────────────────────────────────────────────────────

/**
 * Run `forge build` at a project root, writing artifacts/cache to the
 * caller-controlled `outDir`/`cacheDir`. Forcing these via env (which overrides
 * the project's foundry.toml in Foundry's precedence) confines forge's writes to
 * our sandbox — an untrusted uploaded `foundry.toml` can't redirect `out`/
 * `cache_path` to an arbitrary host location. Throws a clean AppError with the
 * compiler diagnostics (not a stack trace) on failure.
 */
async function forgeBuild(
  root: string,
  outDir: string,
  cacheDir: string,
  buildPaths: string[] = [],
): Promise<void> {
  // When a specific target path is given, forge compiles only that file and its
  // import graph — so an unrelated broken sibling in the same directory can't
  // fail the build (only relevant for the lone-file scaffold).
  const result = await execa(
    locateForge(),
    ["build", ...buildPaths, "--root", root, "--extra-output", "userdoc", "devdoc"],
    {
      timeout: FORGE_TIMEOUT_MS,
      reject: false,
      cwd: root,
      // Force EVERY forge-build write path via env (highest precedence, so an
      // untrusted foundry.toml can't redirect them): artifacts, cache, and
      // build-info. build-info is also disabled — we never read it.
      env: {
        FOUNDRY_OUT: outDir,
        FOUNDRY_CACHE_PATH: cacheDir,
        FOUNDRY_BUILD_INFO: "false",
        FOUNDRY_BUILD_INFO_PATH: join(dirname(outDir), "build-info"),
      },
    },
  );
  if (result.exitCode !== 0) {
    const diagnostics = (result.stderr || result.stdout || "forge build failed").trim();
    throw new AppError(`Compilation failed:\n${diagnostics}`, 400);
  }
}

// ── artifact discovery / extraction ──────────────────────────────────────────

interface FoundArtifact {
  jsonPath: string;
  /** Source file the contract came from (forge groups out/ by source basename). */
  sourceFile: string;
  contractName: string;
}

/**
 * Locate the compiled artifact JSON. forge writes `<out>/<SourceFile>.sol/<Contract>.json`.
 * When `fileBasename` is known (source/lone-file mode) we look only in that
 * file's dir; otherwise (project/zip) we search every out subdir for the named
 * contract. Ambiguity throws a helpful AppError listing the candidates.
 */
function locateArtifact(
  outDir: string,
  opts: { fileBasename?: string; contractName?: string },
): FoundArtifact {
  const { fileBasename, contractName } = opts;

  const contractsIn = (dir: string): string[] =>
    existsSync(dir)
      ? readdirSync(dir)
          .filter((f) => f.endsWith(".json"))
          .map((f) => f.slice(0, -".json".length))
      : [];

  if (fileBasename) {
    const dir = join(outDir, fileBasename);
    const names = contractsIn(dir);
    if (names.length === 0) {
      throw new AppError(`No compiled contract found for ${fileBasename}.`, 400);
    }
    const picked = contractName ?? (names.length === 1 ? names[0]! : undefined);
    if (!picked) {
      throw new AppError(
        `${fileBasename} defines multiple contracts (${names.join(", ")}). Specify contractName.`,
        400,
      );
    }
    if (!names.includes(picked)) {
      throw new AppError(
        `Contract "${picked}" not found in ${fileBasename} (have: ${names.join(", ")}).`,
        400,
      );
    }
    return { jsonPath: join(dir, `${picked}.json`), sourceFile: fileBasename, contractName: picked };
  }

  // Project/zip mode: contractName required; search all out subdirs for it.
  if (!contractName) {
    throw new AppError("A project/zip compile needs a contractName to select.", 400);
  }
  const matches: FoundArtifact[] = [];
  for (const sub of existsSync(outDir) ? readdirSync(outDir) : []) {
    if (!sub.endsWith(".sol")) continue; // out/<File>.sol/ dirs only
    const jsonPath = join(outDir, sub, `${contractName}.json`);
    if (existsSync(jsonPath)) matches.push({ jsonPath, sourceFile: sub, contractName });
  }
  if (matches.length === 0) {
    throw new AppError(`Contract "${contractName}" was not found in the compiled output.`, 400);
  }
  if (matches.length > 1) {
    throw new AppError(
      `Contract "${contractName}" is ambiguous (in ${matches.map((m) => m.sourceFile).join(", ")}).`,
      400,
    );
  }
  return matches[0]!;
}

interface Extracted {
  abi: UploadedArtifact["abi"];
  bytecode: string;
  natspec: UploadedArtifact["natspec"];
}

/** Collect library names from a forge artifact's linkReferences map. */
function linkedLibraryNames(
  linkReferences?: Record<string, Record<string, unknown>>,
): string[] {
  if (!linkReferences) return [];
  const names = new Set<string>();
  for (const file of Object.values(linkReferences)) {
    for (const lib of Object.keys(file)) names.add(lib);
  }
  return [...names];
}

/** Read forge's slim artifact JSON → abi + creation bytecode + NatSpec. */
function extractFromArtifact(jsonPath: string): Extracted {
  const json = JSON.parse(readFileSync(jsonPath, "utf8")) as {
    abi?: unknown;
    bytecode?: { object?: string; linkReferences?: Record<string, Record<string, unknown>> } | string;
    userdoc?: Record<string, unknown>;
    devdoc?: Record<string, unknown>;
  };
  const abi = json.abi as UploadedArtifact["abi"] | undefined;
  const bytecodeObj = typeof json.bytecode === "object" ? json.bytecode : undefined;
  const bytecode =
    typeof json.bytecode === "string" ? json.bytecode : json.bytecode?.object;
  // Unlinked creation bytecode carries `__$…$__` library placeholders — never
  // valid hex, so any `_` means the contract needs external-library linking,
  // which we don't do yet. Fail early with the library names instead of letting
  // the deploy revert cryptically on invalid bytecode.
  if (typeof bytecode === "string" && bytecode.includes("_")) {
    const libs = linkedLibraryNames(bytecodeObj?.linkReferences);
    throw new AppError(
      `This contract must be linked with ${libs.length > 1 ? "external libraries" : "an external library"}${
        libs.length ? ` (${libs.join(", ")})` : ""
      } before deployment, which Nightsmith doesn't support yet. Inline the library (make its functions internal) or deploy a version without external libraries.`,
      400,
    );
  }
  if (!Array.isArray(abi) || abi.length === 0) {
    throw new AppError("Compiled artifact has no ABI.", 400);
  }
  if (typeof bytecode !== "string" || bytecode.length <= 2) {
    throw new AppError(
      "Compiled artifact has no creation bytecode (is it an interface/abstract contract?).",
      400,
    );
  }
  const natspec =
    json.userdoc || json.devdoc ? { userdoc: json.userdoc, devdoc: json.devdoc } : undefined;
  return { abi, bytecode, natspec };
}

// ── temp project scaffolding ─────────────────────────────────────────────────

function makeTempDir(): string {
  const base = ensureDir(join(dataDir(), "tmp"));
  return mkdtempSync(join(base, "compile-"));
}

/** Generate a trusted ephemeral foundry.toml. `srcDot` compiles the tree in
 *  place (src="."); otherwise src="src". libs/remappings/allowPaths wire deps. */
function ephemeralFoundryToml(opts: {
  srcDot?: boolean;
  libs?: string[];
  remappings?: string[];
  allowPaths?: string[];
}): string {
  const lines = [
    "[profile.default]",
    `src = ${JSON.stringify(opts.srcDot ? "." : "src")}`,
    'out = "out"',
    `libs = ${JSON.stringify(opts.libs ?? [])}`,
    "optimizer = true",
    "optimizer_runs = 200",
  ];
  if (opts.remappings?.length) lines.push(`remappings = ${JSON.stringify(opts.remappings)}`);
  if (opts.allowPaths?.length) lines.push(`allow_paths = ${JSON.stringify(opts.allowPaths)}`);
  return lines.join("\n") + "\n";
}

/** Scaffold a throwaway Foundry project holding a single pasted source file. */
function scaffoldStandalone(tmp: string, source: string): string {
  writeFileSync(join(tmp, "foundry.toml"), ephemeralFoundryToml({}));
  const src = ensureDir(join(tmp, "src"));
  writeFileSync(join(src, "Source.sol"), source);
  return "Source.sol";
}

const COPY_SKIP = new Set(["node_modules", ".git", "out", "cache", "artifacts", ".foundry"]);

/** Walk up from `start` for a `node_modules` dir (bounded; never above
 *  `boundary`, so an untrusted extracted tree can't reach the host's). */
function findNodeModules(start: string, boundary?: string): string | null {
  let dir = resolve(start);
  const bound = boundary ? resolve(boundary) : null;
  for (let i = 0; i < 40; i++) {
    const nm = join(dir, "node_modules");
    if (existsSync(nm)) return nm;
    if (bound && dir === bound) break;
    const parent = dirname(dir);
    if (parent === dir) break;
    dir = parent;
  }
  return null;
}

/**
 * Explicit remappings for the packages in a node_modules dir so Hardhat-style
 * dependency imports (`@openzeppelin/contracts/…`, `solmate/…`) resolve. Scoped
 * (@x/y) and flat packages both handled. `target` is how forge references the
 * dir (absolute for a trusted local/sandboxed path).
 */
function nodeModulesRemappings(nmDir: string, target: string): string[] {
  const out: string[] = [];
  let entries;
  try {
    entries = readdirSync(nmDir, { withFileTypes: true });
  } catch {
    return out;
  }
  for (const e of entries) {
    if (!e.isDirectory() || (e.name.startsWith(".") && !e.name.startsWith("@"))) continue;
    if (e.name.startsWith("@")) {
      let pkgs;
      try {
        pkgs = readdirSync(join(nmDir, e.name), { withFileTypes: true });
      } catch {
        continue;
      }
      for (const pkg of pkgs) {
        if (pkg.isDirectory()) out.push(`${e.name}/${pkg.name}/=${target}/${e.name}/${pkg.name}/`);
      }
    } else {
      out.push(`${e.name}/=${target}/${e.name}/`);
    }
  }
  return out;
}

/**
 * Scaffold a throwaway project from a real directory (a lone `.sol`'s dir, or a
 * plain non-Foundry project dir). Copies the tree into `src/` so relative
 * imports resolve; a nearby node_modules is wired via absolute remappings so
 * dependency imports resolve too. `.env` and heavy/build dirs are never copied.
 */
function scaffoldFromDir(tmp: string, srcDir: string, nmBoundary?: string): void {
  const nm = findNodeModules(srcDir, nmBoundary);
  writeFileSync(
    join(tmp, "foundry.toml"),
    ephemeralFoundryToml({
      libs: nm ? [nm] : [],
      remappings: nm ? nodeModulesRemappings(nm, nm) : [],
      allowPaths: nm ? [nm] : [],
    }),
  );
  cpSync(srcDir, join(tmp, "src"), {
    recursive: true,
    filter: (s) => {
      const b = basename(s);
      return !COPY_SKIP.has(b) && !/^\.env(\.|$)/.test(b);
    },
  });
}

/** Walk up from `start` looking for a directory containing foundry.toml. */
function findProjectRoot(start: string): string | null {
  let dir = resolve(start);
  // eslint-disable-next-line no-constant-condition
  while (true) {
    if (existsSync(join(dir, "foundry.toml"))) return dir;
    const parent = dirname(dir);
    if (parent === dir) return null;
    dir = parent;
  }
}

/** Best-effort: read the source text of a file by basename under the project. */
function findSourceText(root: string, fileBasename: string): string | undefined {
  const skip = new Set(["out", "cache", "node_modules", ".git"]);
  const stack = [root];
  while (stack.length > 0) {
    const dir = stack.pop()!;
    let entries;
    try {
      entries = readdirSync(dir, { withFileTypes: true });
    } catch {
      continue;
    }
    for (const e of entries) {
      const full = join(dir, e.name);
      if (e.isDirectory()) {
        if (!skip.has(e.name)) stack.push(full);
      } else if (e.name === fileBasename) {
        try {
          return readFileSync(full, "utf8");
        } catch {
          return undefined;
        }
      }
    }
  }
  return undefined;
}

// ── main entry ───────────────────────────────────────────────────────────────

/**
 * Compile a Solidity contract with `forge` and return an artifact ready for
 * `saveArtifact()`. Accepts inline source, a local path (file or Foundry
 * project), or a base64 zip of a project — see CompileArtifactRequest.
 */
export async function compileSolidity(
  input: CompileArtifactRequest,
): Promise<UploadedArtifact> {
  await assertForgeInstalled();
  if (input.source !== undefined) {
    return withTempProject((tmp) => {
      const fileBasename = scaffoldStandalone(tmp, input.source!);
      return finish(tmp, { fileBasename, sourceText: input.source }, input);
    });
  }
  if (input.path !== undefined) return compileFromPath(input);
  if (input.zipBase64 !== undefined) return compileFromZip(input);
  throw new AppError("provide exactly one of: source, path, zipBase64", 400);
}

async function withTempProject<T>(fn: (tmp: string) => Promise<T>): Promise<T> {
  const tmp = makeTempDir();
  try {
    return await fn(tmp);
  } finally {
    rmSync(tmp, { recursive: true, force: true });
  }
}

/** Build the (already-scaffolded or real) project at `root`, extract, package.
 *  Artifacts/cache go to a private scratch dir (never the user's project dir),
 *  cleaned up afterward. */
async function finish(
  root: string,
  target: { fileBasename?: string; sourceText?: string; buildPath?: string },
  input: CompileArtifactRequest,
): Promise<UploadedArtifact> {
  const scratch = makeTempDir();
  try {
    const outDir = join(scratch, "out");
    await forgeBuild(root, outDir, join(scratch, "cache"), target.buildPath ? [target.buildPath] : []);
    const found = locateArtifact(outDir, {
      fileBasename: target.fileBasename,
      contractName: input.contractName,
    });
    const { abi, bytecode, natspec } = extractFromArtifact(found.jsonPath);
    const source = target.sourceText ?? findSourceText(root, found.sourceFile);
    const name = (input.name ?? found.contractName).trim();
    return { name, abi, bytecode, natspec, source };
  } finally {
    rmSync(scratch, { recursive: true, force: true });
  }
}

async function compileFromPath(input: CompileArtifactRequest): Promise<UploadedArtifact> {
  const p = input.path!;
  if (!isAbsolute(p)) throw new AppError("path must be absolute.", 400);
  if (!existsSync(p)) throw new AppError(`path does not exist: ${p}`, 400);
  const isFile = statSync(p).isFile();

  const explicitRoot = input.root ? resolve(input.root) : null;
  const root = explicitRoot ?? findProjectRoot(isFile ? dirname(p) : p);

  if (root) {
    // Real Foundry project: build in place (imports/libs resolve).
    return finish(root, { fileBasename: isFile ? basename(p) : undefined }, input);
  }
  // No foundry.toml (e.g. a Hardhat repo): scaffold an ephemeral project from the
  // relevant directory so relative imports (and a nearby node_modules) resolve.
  // A file → its containing dir; a directory → itself.
  const srcDir = isFile ? dirname(p) : p;
  const sourceText = isFile ? readFileSync(p, "utf8") : undefined;
  return withTempProject((tmp) => {
    scaffoldFromDir(tmp, srcDir);
    // Lone file: build only that file (+ its imports) so unrelated broken
    // siblings in the same directory don't fail the build. The file is copied to
    // the top of src/, so its build path is `src/<basename>`.
    return finish(
      tmp,
      isFile
        ? { fileBasename: basename(p), sourceText, buildPath: `src/${basename(p)}` }
        : {},
      input,
    );
  });
}

async function compileFromZip(input: CompileArtifactRequest): Promise<UploadedArtifact> {
  if (!input.contractName) {
    throw new AppError("A zip compile needs a contractName to select.", 400);
  }
  const buf = Buffer.from(input.zipBase64!, "base64");
  if (buf.length === 0) throw new AppError("zip is empty or not valid base64.", 400);
  if (buf.length > MAX_ZIP_BYTES) {
    throw new AppError(`zip is too large (max ${MAX_ZIP_BYTES / 1024 / 1024} MB).`, 400);
  }
  return withTempProject(async (tmp) => {
    const zipPath = join(tmp, "upload.zip");
    const dest = ensureDir(join(tmp, "project"));
    writeFileSync(zipPath, buf);
    await assertZipWithinLimits(zipPath);
    // Reject symlink entries BEFORE extracting — a post-extraction audit is too
    // late (unzip could follow a symlink written earlier to escape `dest`).
    await assertNoSymlinkEntries(zipPath);
    // `unzip` refuses absolute/`..` paths; -o overwrite, -q quiet, -d dest.
    const res = await execa("unzip", ["-o", "-q", zipPath, "-d", dest], {
      timeout: 60_000,
      reject: false,
    });
    if (res.exitCode !== 0) {
      throw new AppError(`Could not unzip the archive: ${(res.stderr || "").trim()}`, 400);
    }
    assertNoEscape(dest);
    // Root = the extraction dir, or a single top-level folder inside it.
    const root = existsSync(join(dest, "foundry.toml")) ? dest : unwrapSingleDir(dest);
    // Strip `.env` before any build — forge loads dotenv from cwd, and a
    // `.env` could inject FOUNDRY_SOLC=./evil (arbitrary-exec) regardless of
    // whether the zip ships its own foundry.toml.
    stripDotenvFiles(root);

    if (existsSync(join(root, "foundry.toml"))) {
      // Trust the project's own config, but reject its exec/path escapes.
      hardenUploadedProject(root);
      return finish(root, {}, input);
    }
    // Plain .sol project (no foundry.toml): scaffold a trusted ephemeral project
    // from the extracted tree. node_modules is confined to inside the tree
    // (never the host's) so an untrusted upload can't reach outside the sandbox.
    const proj = ensureDir(join(tmp, "scaffold"));
    scaffoldFromDir(proj, root, root);
    return finish(proj, {}, input);
  });
}

/**
 * Reject a zip bomb before extracting: read the central directory (`unzip -l`)
 * and enforce total uncompressed size + entry-count caps. `unzip -l` reads the
 * directory only — it does not extract — so this is cheap and safe.
 */
async function assertZipWithinLimits(zipPath: string): Promise<void> {
  const res = await execa("unzip", ["-l", zipPath], { timeout: 30_000, reject: false });
  if (res.exitCode !== 0) {
    throw new AppError(`Not a readable zip: ${(res.stderr || "").trim()}`, 400);
  }
  // Final summary line: "  <totalBytes>   <n> files".
  const summary = res.stdout.trim().split("\n").pop() ?? "";
  const m = summary.match(/(\d+)\s+(\d+)\s+files?/);
  if (m) {
    const totalBytes = Number(m[1]);
    const entries = Number(m[2]);
    if (totalBytes > MAX_UNZIPPED_BYTES) {
      throw new AppError(
        `zip expands too large (${Math.round(totalBytes / 1024 / 1024)} MB, max ${MAX_UNZIPPED_BYTES / 1024 / 1024} MB).`,
        400,
      );
    }
    if (entries > MAX_ZIP_ENTRIES) {
      throw new AppError(`zip has too many files (${entries}, max ${MAX_ZIP_ENTRIES}).`, 400);
    }
  }
}

/**
 * Reject any symlink entry in the archive BEFORE extraction. zipinfo
 * (`unzip -Z`) prints a unix mode per entry; a leading "l" marks a symlink.
 * Foundry projects don't need symlinks, so refusing them removes the
 * extract-time traversal risk entirely (no symlink is ever written).
 */
async function assertNoSymlinkEntries(zipPath: string): Promise<void> {
  const res = await execa("unzip", ["-Z", zipPath], { timeout: 30_000, reject: false });
  if (res.exitCode !== 0) return; // readability/size already validated
  for (const line of res.stdout.split("\n")) {
    if (/^l[-rwxsStT]{9}\b/.test(line)) {
      throw new AppError("Archive contains a symlink entry, which is not allowed.", 400);
    }
  }
}

/** Zip-slip defense (belt-and-suspenders): no extracted entry may be a symlink
 *  escaping `dest`. Primary defense is rejecting symlinks pre-extraction. */
function assertNoEscape(dest: string): void {
  const root = resolve(dest);
  const stack = [root];
  while (stack.length > 0) {
    const dir = stack.pop()!;
    for (const e of readdirSync(dir, { withFileTypes: true })) {
      const full = join(dir, e.name);
      if (e.isSymbolicLink()) {
        let link = "";
        try {
          link = readlinkSync(full);
        } catch {
          link = "";
        }
        const target = resolve(dir, link);
        // Prefix match with a trailing separator so `<root>-evil` can't pass as
        // `<root>` (plain startsWith(root) is a classic path-boundary bug).
        if (target !== root && !target.startsWith(root + sep)) {
          throw new AppError("Archive contains a symlink escaping the extract dir.", 400);
        }
      } else if (e.isDirectory()) {
        stack.push(full);
      }
    }
  }
}

/**
 * Neutralize code-execution vectors in an UNTRUSTED uploaded project before we
 * run `forge build` on it. `forge build` can be steered into executing an
 * arbitrary binary as the server user via a compiler path — from foundry.toml
 * (`solc = "./evil"`) or from a project `.env` (`FOUNDRY_SOLC=./evil`). We:
 *   1. reject a foundry.toml that selects a compiler by filesystem path (a bare
 *      semver like "0.8.24" is fine — svm downloads a trusted solc), and
 *   2. delete any `.env` files so forge's dotenv loading can't inject config
 *      (done separately via stripDotenvFiles, before ANY uploaded build).
 * FOUNDRY_OUT/CACHE forcing only confines writes; this confines execution.
 */
function hardenUploadedProject(root: string): void {
  const toml = readFileSync(join(root, "foundry.toml"), "utf8");
  const solc = /^\s*(solc|solc_version)\s*=\s*["']?([^"'\n#]+)["']?/gim;
  let m: RegExpExecArray | null;
  while ((m = solc.exec(toml))) {
    const value = m[2]!.trim();
    if (!/^v?\d+\.\d+\.\d+$/.test(value)) {
      throw new AppError(
        `Uploaded foundry.toml selects a compiler by path (${m[1]} = "${value}"), which is not allowed. Use a version like "0.8.24".`,
        400,
      );
    }
  }
  // Reject read-path config that escapes the project root — an absolute path or
  // `..` in remappings/libs/etc. lets forge read arbitrary host files (e.g.
  // `remappings = ["x/=/"]` + `import "x/etc/passwd"`), whose contents could
  // leak back through compiler diagnostics. Legit projects use relative paths.
  const readPaths = /^\s*(remappings|libs|allow_paths|include_paths|src|test|script)\s*=\s*(.+)$/gim;
  while ((m = readPaths.exec(toml))) {
    const rhs = m[2]!;
    if (/\.\./.test(rhs) || /[="'[,\s]\//.test(rhs)) {
      throw new AppError(
        `Uploaded foundry.toml sets "${m[1]}" to a path outside the project (absolute or "..") — not allowed.`,
        400,
      );
    }
  }
}

/** Delete every `.env` / `.env.*` in an extracted tree — forge loads dotenv from
 *  cwd, and a `.env` could inject FOUNDRY_SOLC=./evil (arbitrary exec). */
function stripDotenvFiles(root: string): void {
  const skip = new Set(["out", "cache", ".git", "node_modules"]);
  const stack = [root];
  while (stack.length > 0) {
    const dir = stack.pop()!;
    for (const e of readdirSync(dir, { withFileTypes: true })) {
      const full = join(dir, e.name);
      if (e.isDirectory()) {
        if (!skip.has(e.name)) stack.push(full);
      } else if (/^\.env(\.|$)/.test(e.name)) {
        rmSync(full, { force: true });
      }
    }
  }
}

/** If `dir` has exactly one subdir and no files, return it (common zip layout). */
function unwrapSingleDir(dir: string): string {
  const entries = readdirSync(dir, { withFileTypes: true });
  const dirs = entries.filter((e) => e.isDirectory());
  const files = entries.filter((e) => e.isFile());
  if (dirs.length === 1 && files.length === 0) return join(dir, dirs[0]!.name);
  return dir;
}
