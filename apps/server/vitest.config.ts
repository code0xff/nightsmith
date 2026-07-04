import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    // Compile tests shell out to forge (and may download a solc on a cold cache).
    testTimeout: 180_000,
    hookTimeout: 180_000,
    include: ["src/**/*.test.ts"],
  },
});
