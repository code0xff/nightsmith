import Fastify, { type FastifyInstance } from "fastify";
import fastifyWebsocket from "@fastify/websocket";
import fastifyStatic from "@fastify/static";
import { ZodError } from "zod";
import { SERVER_HOST, SERVER_PORT } from "./config.js";
import { webDistDir } from "./utils/paths.js";
import { Runtime } from "./runtime/runtime.js";
import { registerLocalnetRoutes } from "./routes/localnet.js";
import { registerPromptRoutes } from "./routes/prompt.js";
import { registerExecuteRoutes } from "./routes/execute.js";
import { registerSessionRoutes } from "./routes/sessions.js";
import { registerExportRoutes } from "./routes/export.js";
import { registerAiRoutes } from "./routes/ai.js";
import { registerAnvilRoutes } from "./routes/anvil.js";
import { registerWebSocket } from "./ws/stream.js";
import { AppError, errorMessage } from "./utils/errors.js";
import { logger } from "./utils/logger.js";

export interface BlacksmithServer {
  app: FastifyInstance;
  runtime: Runtime;
}

/** Build the Fastify app and runtime without listening (useful for tests). */
export async function buildServer(): Promise<BlacksmithServer> {
  const app = Fastify({ logger: false });
  const runtime = new Runtime();

  await app.register(fastifyWebsocket);

  app.setErrorHandler((err, _req, reply) => {
    if (err instanceof ZodError) {
      reply.status(400).send({
        error: "Invalid request",
        details: err.issues.map((i) => `${i.path.join(".") || "(root)"}: ${i.message}`),
      });
      return;
    }
    if (err instanceof AppError) {
      reply.status(err.statusCode).send({ error: err.message, details: err.details });
      return;
    }
    const message = errorMessage(err);
    logger.error(`Unhandled error: ${message}`);
    reply.status(500).send({ error: message });
  });

  app.get("/api/health", async () => ({
    ok: true,
    name: "blacksmith",
    running: runtime.isRunning(),
  }));

  registerWebSocket(app, runtime);
  registerLocalnetRoutes(app, runtime);
  registerPromptRoutes(app, runtime);
  registerExecuteRoutes(app, runtime);
  registerSessionRoutes(app, runtime);
  registerExportRoutes(app);
  registerAiRoutes(app);
  registerAnvilRoutes(app, runtime);

  // Serve the built web cockpit (when present) with an SPA fallback.
  const webDist = webDistDir();
  if (webDist) {
    await app.register(fastifyStatic, { root: webDist });
    app.setNotFoundHandler((req, reply) => {
      const url = req.raw.url ?? "";
      if (url.startsWith("/api") || url.startsWith("/ws")) {
        reply.status(404).send({ error: "Not found" });
        return;
      }
      reply.sendFile("index.html");
    });
  }

  return { app, runtime };
}

/** Build and start the server, returning the handle for graceful shutdown. */
export async function startServer(): Promise<BlacksmithServer> {
  const server = await buildServer();
  await server.app.listen({ port: SERVER_PORT, host: SERVER_HOST });
  logger.info(`Blacksmith cockpit on http://${SERVER_HOST}:${SERVER_PORT}`);
  if (!webDistDir()) {
    logger.warn("No web build found — run `pnpm --filter @blacksmith/web build`, or use `pnpm dev:web` for the dev UI");
  }

  const shutdown = async () => {
    logger.info("Shutting down…");
    await server.runtime.stopLocalnet().catch(() => {});
    await server.app.close().catch(() => {});
    process.exit(0);
  };
  process.once("SIGINT", shutdown);
  process.once("SIGTERM", shutdown);

  return server;
}
