import { createRequire } from "node:module"
import { execFileSync } from "node:child_process"

// Run from desktop/packages/web, with the temporary archived fixture in perf/.
const repo = "/Users/akiralam/code/ax-coder-old"
const revision = "13e4263"
const sourcePaths = [
  "desktop/packages/ui/src/lib/jsonTreeUtils.ts",
  "desktop/packages/ui/src/components/ui/JsonTreeViewer.tsx",
]
const originalSources = new Map(sourcePaths.map((source) => [
  `${repo}/${source}`,
  execFileSync("git", ["show", `${revision}:${source}`], { cwd: repo, encoding: "utf8" })
    // Instrument historical rows without changing their computation or compiler configuration.
    .replace('ref={parentRef} className={className}', 'ref={parentRef} data-json-tree="virtualized" className={className}')
    .replace('key={flatNode.node.id}\n                  style=', 'key={flatNode.node.id}\n                  data-json-tree-row={virtualRow.index}\n                  style='),
]))
const require = createRequire(`${repo}/desktop/packages/web/package.json`)
const { build } = await import(require.resolve("vite"))
await build({
  configFile: `${repo}/desktop/packages/web/vite.config.ts`,
  plugins: [{
    name: "historical-json-tree-baseline",
    enforce: "pre",
    load(id) { return originalSources.get(id) },
  }],
  build: {
    outDir: "/tmp/ax-coder-json-tree-baseline-dist",
    emptyOutDir: true,
    rollupOptions: { input: `${repo}/desktop/packages/web/perf/renderer.html` },
  },
})
