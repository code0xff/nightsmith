import { defineConfig, type ProxyOptions } from "vite";
import react from "@vitejs/plugin-react";
import { fileURLToPath, URL } from "node:url";

const SERVER = process.env.BLACKSMITH_SERVER ?? "http://127.0.0.1:4040";

// Swallow benign proxy errors (EPIPE/ECONNREFUSED) that occur when the backend
// is restarting or when the client closes a WebSocket mid-flush (common under
// React StrictMode's double-mount). Without this, vite logs a noisy stack.
const quietProxyErrors: ProxyOptions["configure"] = (proxy) => {
  proxy.on("error", (err) => {
    const code = (err as NodeJS.ErrnoException).code;
    if (code === "EPIPE" || code === "ECONNREFUSED" || code === "ECONNRESET") return;
    console.warn(`[proxy] ${err.message}`);
  });
};

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      "@": fileURLToPath(new URL("./src", import.meta.url)),
    },
  },
  server: {
    port: 4042,
    proxy: {
      "/api": { target: SERVER, changeOrigin: true, configure: quietProxyErrors },
      "/ws": { target: SERVER, ws: true, changeOrigin: true, configure: quietProxyErrors },
    },
  },
  build: {
    outDir: "dist",
  },
});
