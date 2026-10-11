import { createRequire } from "node:module"
import { execFileSync } from "node:child_process"

// Run from desktop/packages/web, with the temporary archived fixture in perf/.
const repo = "/Users/akiralam/code/ax-coder-old"
const revision = "0984a9ce49b8719187a79f2b9f2fca9b863110f2"
const sourcePaths = [
  "desktop/packages/ui/src/components/chat/message/parts/ToolPart-impl.tsx",
  "desktop/packages/ui/src/components/chat/message/ToolOutputDialog.tsx",
]
const originalSources = new Map(sourcePaths.map((source) => [
  `${repo}/${source}`,
  execFileSync("git", ["show", `${revision}:${source}`], { cwd: repo, encoding: "utf8" }),
]))
const require = createRequire(`${repo}/desktop/packages/web/package.json`)
const { build } = await import(require.resolve("vite"))
await build({
  configFile: `${repo}/desktop/packages/web/vite.config.ts`,
  plugins: [{
    name: "historical-tool-output-baseline",
    enforce: "pre",
    load(id) { return originalSources.get(id) },
  }],
  build: {
    outDir: "/tmp/ax-coder-tool-output-baseline-dist",
    emptyOutDir: true,
    rollupOptions: { input: `${repo}/desktop/packages/web/perf/renderer.html` },
  },
})
