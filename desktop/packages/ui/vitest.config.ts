import { defineConfig } from "vitest/config"
import { createRequire } from "node:module"
import path from "node:path"
import { fileURLToPath, pathToFileURL } from "node:url"

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const requireFromWeb = createRequire(path.resolve(__dirname, "../web/package.json"))
const react = (await import(pathToFileURL(requireFromWeb.resolve("@vitejs/plugin-react")).href)).default
const uiSrc = path.resolve(__dirname, "src")

export default defineConfig({
  // Compile tests exactly like the production renderer (web/vite.config.ts). Without the compiler,
  // memoization regressions stay invisible here and only show up in a shipped build, where the app
  // freezes values the compiler captured and the suite still passes.
  plugins: [react({ babel: { plugins: ["babel-plugin-react-compiler"] } })],
  resolve: {
    alias: [
      { find: "@openchamber/ui", replacement: uiSrc },
      { find: /^@\//, replacement: `${uiSrc}/` },
    ],
  },
  test: {
    environment: "jsdom",
    setupFiles: [path.resolve(uiSrc, "test/setup.ts")],
    include: ["src/**/*.test.{ts,tsx,js,jsx}"],
  },
})
