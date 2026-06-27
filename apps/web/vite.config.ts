import { createLogger, defineConfig, type ProxyOptions } from "vite";
import react from "@vitejs/plugin-react";
import { fileURLToPath, URL } from "node:url";

const SERVER = process.env.NIGHTSMITH_SERVER ?? "http://127.0.0.1:4040";

// Bind host for the dev server. Defaults to loopback; set
// `NIGHTSMITH_WEB_HOST=0.0.0.0` (or `true`) to expose the dev UI on the LAN.
const WEB_HOST = process.env.NIGHTSMITH_WEB_HOST;
const WEB_PORT = Number(process.env.NIGHTSMITH_WEB_PORT ?? 4042);

// Benign proxy churn: when the backend restarts, or when the client closes a
// WebSocket mid-flush (common under React StrictMode's double-mount), the proxy
// socket can EPIPE/ECONNRESET. These are harmless — the client auto-reconnects.
const BENIGN = /ws proxy|EPIPE|ECONNRESET|ECONNREFUSED|ECONNABORTED/;

const quietProxyErrors: ProxyOptions["configure"] = (proxy) => {
  // Attach our own handler so the error event is never unhandled.
  proxy.on("error", () => {});
};

// Vite registers its OWN proxy 'error' listener that logs "ws proxy socket
// error" — our handler can't suppress that, so filter it at the logger.
const logger = createLogger();
const baseError = logger.error.bind(logger);
logger.error = (msg, options) => {
  if (typeof msg === "string" && BENIGN.test(msg)) return;
  baseError(msg, options);
};

export default defineConfig({
  plugins: [react()],
  customLogger: logger,
  resolve: {
    alias: {
      "@": fileURLToPath(new URL("./src", import.meta.url)),
    },
  },
  server: {
    port: WEB_PORT,
    ...(WEB_HOST ? { host: WEB_HOST === "true" ? true : WEB_HOST } : {}),
    proxy: {
      "/api": { target: SERVER, changeOrigin: true, configure: quietProxyErrors },
      "/ws": { target: SERVER, ws: true, changeOrigin: true, configure: quietProxyErrors },
    },
  },
  build: {
    outDir: "dist",
  },
});
