import { fileURLToPath } from "node:url"
import { defineConfig } from "vitest/config"

export default defineConfig({
  resolve: {
    // Upstream tests import from bun:test; the shim maps that API onto Vitest so lib/ stays byte-identical to upstream.
    alias: { "bun:test": fileURLToPath(new URL("./test/bun-test-shim.ts", import.meta.url)) },
  },
  test: {
    // Upstream runs these tests under Happy DOM; jsdom rejects some of their synthetic events.
    environment: "happy-dom",
    include: ["lib/**/*.test.ts"],
    setupFiles: ["./test/setup.ts"],
  },
})
