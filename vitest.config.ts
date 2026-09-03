import { defineConfig } from "vitest/config"

export default defineConfig({
  test: {
    environment: "node",
    include: ["script/**/*.test.{ts,mts,js,mjs,cjs}", "tools/**/*.test.{ts,mts,js,mjs,cjs}"],
  },
})
