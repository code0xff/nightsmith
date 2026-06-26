import { defineConfig } from "tsup";

export default defineConfig({
  entry: {
    cli: "src/cli.ts",
    server: "src/server.ts",
  },
  format: ["esm"],
  target: "node20",
  platform: "node",
  clean: true,
  sourcemap: true,
  // Bundle the workspace packages (they export TS source) into the output.
  noExternal: [/@blacksmith\//],
  banner: { js: "#!/usr/bin/env node" },
});
