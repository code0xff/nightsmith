import { startServer } from "./server.js";

// Entry point for `pnpm dev` (tsx watch). The web dev server proxies /api and
// /ws here; in production the CLI serves the built UI from the same process.
startServer().catch((err) => {
  process.stderr.write(`Failed to start server: ${String(err)}\n`);
  process.exit(1);
});
