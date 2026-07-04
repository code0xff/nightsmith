import { execa } from "execa";
import {
  chmodSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from "node:fs";
import { readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { compileSolidity } from "./compile.js";

/** Whether a CLI is runnable (skip the suite gracefully in a toolless env). */
async function toolOk(cmd: string, args = ["--version"]): Promise<boolean> {
  try {
    await execa(cmd, args, { timeout: 10_000 });
    return true;
  } catch {
    return false;
  }
}

const forgeBin =
  (await toolOk(join(process.env.HOME ?? "", ".foundry/bin/forge")))
    ? join(process.env.HOME ?? "", ".foundry/bin/forge")
    : (await toolOk("forge"))
      ? "forge"
      : null;
const zipOk = await toolOk("zip", ["-v"]);
const unzipOk = await toolOk("unzip", ["-v"]);
const canRun = Boolean(forgeBin) && zipOk && unzipOk;

const SPDX = "// SPDX-License-Identifier: MIT\n";
const COUNTER = `${SPDX}pragma solidity ^0.8.20;\ncontract Counter { uint256 public number; function inc() external { number += 1; } }\n`;

let root: string;
const dirs: string[] = [];

/** Create a fresh fixture dir with the given relative files. */
function makeDir(files: Record<string, string>): string {
  const dir = mkdtempSync(join(root, "fx-"));
  dirs.push(dir);
  for (const [rel, content] of Object.entries(files)) {
    const full = join(dir, rel);
    mkdirSync(join(full, ".."), { recursive: true });
    writeFileSync(full, content);
  }
  return dir;
}

/** Zip a directory's contents; `-y` preserves symlinks as symlinks. */
async function zipDir(dir: string, symlinks = false): Promise<string> {
  const zipPath = join(root, `z-${dirs.length}-${Math.round(performance.now())}.zip`);
  await execa("zip", ["-q", "-r", ...(symlinks ? ["-y"] : []), zipPath, "."], { cwd: dir });
  return zipPath;
}

const b64 = (p: string) => readFileSync(p).toString("base64");

beforeAll(() => {
  root = mkdtempSync(join(tmpdir(), "nightsmith-compile-test-"));
});
afterAll(() => {
  rmSync(root, { recursive: true, force: true });
});

describe.skipIf(!canRun)("compileSolidity", () => {
  // ── happy paths ────────────────────────────────────────────────────────────

  it("compiles inline source", async () => {
    const a = await compileSolidity({ source: COUNTER });
    expect(a.name).toBe("Counter");
    expect(a.bytecode.startsWith("0x")).toBe(true);
    expect(a.bytecode.length).toBeGreaterThan(2);
    expect(a.abi.some((i: any) => i.type === "function" && i.name === "inc")).toBe(true);
  });

  it("compiles a lone file even with a broken sibling in the same dir", async () => {
    const dir = makeDir({
      "interfaces/IX.sol": `${SPDX}pragma solidity ^0.8.20;\ninterface IX { function x() external view returns (uint); }\n`,
      "Good.sol": `${SPDX}pragma solidity ^0.8.20;\nimport "./interfaces/IX.sol";\ncontract Good is IX { function x() external pure returns (uint) { return 1; } }\n`,
      "Broken.sol": "this is not solidity at all",
    });
    const a = await compileSolidity({ path: join(dir, "Good.sol"), contractName: "Good" });
    expect(a.name).toBe("Good");
  });

  it("resolves a node_modules dependency import (path mode)", async () => {
    const dir = makeDir({
      "node_modules/@foo/bar/Bar.sol": `${SPDX}pragma solidity ^0.8.20;\ncontract Bar { function b() public pure returns (uint) { return 42; } }\n`,
      "contracts/Uses.sol": `${SPDX}pragma solidity ^0.8.20;\nimport "@foo/bar/Bar.sol";\ncontract Uses is Bar {}\n`,
    });
    const a = await compileSolidity({ path: join(dir, "contracts/Uses.sol"), contractName: "Uses" });
    expect(a.abi.some((i: any) => i.type === "function" && i.name === "b")).toBe(true);
  });

  it("compiles a no-foundry.toml project from a zip (auto-scaffold)", async () => {
    const dir = makeDir({ "Counter.sol": COUNTER });
    const zip = await zipDir(dir);
    const a = await compileSolidity({ zipBase64: b64(zip), contractName: "Counter" });
    expect(a.name).toBe("Counter");
  });

  // ── rejections / hardening ───────────────────────────────────────────────────

  it("rejects a contract needing external-library linking", async () => {
    const src = `${SPDX}pragma solidity ^0.8.20;\nlibrary L { function a(uint x, uint y) public pure returns (uint) { return x + y; } }\ncontract C { function f(uint x) external pure returns (uint) { return L.a(x, 1); } }\n`;
    await expect(compileSolidity({ source: src, contractName: "C" })).rejects.toThrow(/link/i);
  });

  it("rejects a zip containing a symlink entry", async () => {
    const dir = makeDir({
      "foundry.toml": '[profile.default]\nsrc="."\nout="out"\n',
      "Z.sol": `${SPDX}pragma solidity ^0.8.20;\ncontract Z {}\n`,
    });
    symlinkSync("/etc/passwd", join(dir, "escape"));
    const zip = await zipDir(dir, true);
    // Assert the PRE-extraction guard's exact wording ("symlink entry"), not the
    // generic post-extraction escape audit, so this proves the intended path.
    await expect(compileSolidity({ zipBase64: b64(zip), contractName: "Z" })).rejects.toThrow(
      /symlink entry/i,
    );
  });

  it("rejects a zip foundry.toml that selects a compiler by path", async () => {
    const dir = makeDir({
      "foundry.toml": '[profile.default]\nsrc="."\nout="out"\nsolc = "./evil"\n',
      "Z.sol": `${SPDX}pragma solidity ^0.8.20;\ncontract Z {}\n`,
    });
    const zip = await zipDir(dir);
    await expect(compileSolidity({ zipBase64: b64(zip), contractName: "Z" })).rejects.toThrow(
      /compiler by path/i,
    );
  });

  it("rejects a zip foundry.toml with a remapping escaping the project", async () => {
    const dir = makeDir({
      "foundry.toml": '[profile.default]\nsrc="."\nout="out"\nremappings = ["x/=/"]\n',
      "Z.sol": `${SPDX}pragma solidity ^0.8.20;\ncontract Z {}\n`,
    });
    const zip = await zipDir(dir);
    await expect(compileSolidity({ zipBase64: b64(zip), contractName: "Z" })).rejects.toThrow(
      /outside the project/i,
    );
  });

  it("strips a malicious .env so forge's dotenv can't run code (uploaded foundry.toml)", async () => {
    const marker = join(root, `pwned-${Math.round(performance.now())}`);
    // Include a foundry.toml so the archive builds in place (root), exercising
    // stripDotenvFiles specifically — the scaffold-copy path filters .env too, so
    // a no-foundry.toml zip wouldn't isolate this guard.
    const dir = makeDir({
      "foundry.toml": '[profile.default]\nsrc="."\nout="out"\n',
      ".env": `FOUNDRY_SOLC=./evil.sh\n`,
      "evil.sh": `#!/bin/sh\ntouch ${marker}\n`,
      "N.sol": `${SPDX}pragma solidity ^0.8.20;\ncontract N { function v() external pure returns (uint) { return 3; } }\n`,
    });
    chmodSync(join(dir, "evil.sh"), 0o755);
    const zip = await zipDir(dir);
    const a = await compileSolidity({ zipBase64: b64(zip), contractName: "N" });
    expect(a.name).toBe("N");
    expect(existsSync(marker)).toBe(false);
  });

  it("caps zip entry count (zip-bomb guard)", async () => {
    const files: Record<string, string> = {
      "foundry.toml": '[profile.default]\nsrc="."\nout="out"\n',
    };
    for (let i = 0; i < 4100; i++) files[`f${i}.txt`] = "x";
    const dir = makeDir(files);
    const zip = await zipDir(dir);
    await expect(compileSolidity({ zipBase64: b64(zip), contractName: "Z" })).rejects.toThrow(
      /too many files/i,
    );
  });
});
