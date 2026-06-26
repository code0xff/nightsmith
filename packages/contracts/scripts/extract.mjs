// Regenerate the slim, committed artifact (abi + bytecode) from forge output.
// Run via `pnpm --filter @nightsmith/contracts compile`.
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const forgeArtifact = JSON.parse(
  readFileSync(join(root, "out/MockERC20.sol/MockERC20.json"), "utf8"),
);

const slim = {
  contractName: "MockERC20",
  abi: forgeArtifact.abi,
  bytecode: forgeArtifact.bytecode.object,
};

mkdirSync(join(root, "artifacts"), { recursive: true });
writeFileSync(
  join(root, "artifacts/MockERC20.json"),
  JSON.stringify(slim, null, 2) + "\n",
);
console.log(
  `wrote artifacts/MockERC20.json (abi: ${slim.abi.length}, bytecode: ${slim.bytecode.length} chars)`,
);
