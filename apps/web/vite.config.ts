import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { fileURLToPath, URL } from "node:url";

const SERVER = process.env.BLACKSMITH_SERVER ?? "http://127.0.0.1:4040";

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
      "/api": { target: SERVER, changeOrigin: true },
      "/ws": { target: SERVER, ws: true, changeOrigin: true },
    },
  },
  build: {
    outDir: "dist",
  },
});
