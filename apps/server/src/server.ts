import Fastify, { type FastifyInstance } from "fastify";
import { ZodError } from "zod";
import { SERVER_HOST, SERVER_PORT } from "./config.js";
import { Runtime } from "./runtime/runtime.js";
import { registerLocalnetRoutes } from "./routes/localnet.js";
import { AppError, errorMessage } from "./utils/errors.js";
import { logger } from "./utils/logger.js";

export interface BlacksmithServer {
  app: FastifyInstance;
  runtime: Runtime;
}

/** Build the Fastify app and runtime without listening (useful for tests). */
export function buildServer(): BlacksmithServer {
  const app = Fastify({ logger: false });
  const runtime = new Runtime();

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

  registerLocalnetRoutes(app, runtime);

  return { app, runtime };
}

/** Build and start the server, returning the handle for graceful shutdown. */
export async function startServer(): Promise<BlacksmithServer> {
  const server = buildServer();
  await server.app.listen({ port: SERVER_PORT, host: SERVER_HOST });
  logger.info(`Blacksmith cockpit on http://${SERVER_HOST}:${SERVER_PORT}`);

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
