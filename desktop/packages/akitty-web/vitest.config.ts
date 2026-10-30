import { fileURLToPath } from "node:url"
import { defineConfig } from "vitest/config"

export default defineConfig({
  resolve: {
    // Older tests still import from bun:test; the shim maps that API onto Vitest.
    alias: { "bun:test": fileURLToPath(new URL("./test/bun-test-shim.ts", import.meta.url)) },
  },
  test: {
    // Happy DOM, because jsdom rejects some of the synthetic events these tests dispatch.
    environment: "happy-dom",
    include: ["lib/**/*.test.ts"],
    setupFiles: ["./test/setup.ts"],
  },
})
