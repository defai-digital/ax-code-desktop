import { createRequire } from "node:module"
import { fileURLToPath } from "node:url"
import path from "node:path"
import { readFileSync } from "node:fs"
import { execFileSync } from "node:child_process"
const repo = fileURLToPath(new URL("../../../../", import.meta.url))
const require = createRequire(path.join(repo, "desktop/packages/web/package.json"))
const { build } = await import(require.resolve("vite"))
const { build: bundle } = await import(createRequire(require.resolve("vite")).resolve("esbuild"))
const baseline = process.env.AX_NATIVE_BENCH_BASELINE === "1"
const originals = new Map(
  baseline
    ? ["markdownWorkerParser.ts", "markdownParser.worker.ts", "useMarkdownBlocks.ts"].map((name) => {
        const relative = `desktop/packages/ui/src/components/chat/${name}`
        return [
          path.join(repo, relative),
          execFileSync("git", ["show", `2835ca9:${relative}`], { cwd: repo, encoding: "utf8" }),
        ]
      })
    : [],
)
if (baseline) {
  const relative = "desktop/packages/ui/src/lib/url.ts"
  originals.set(
    path.join(repo, relative),
    execFileSync("git", ["show", `2835ca9:${relative}`], { cwd: repo, encoding: "utf8" }),
  )
}
const baselinePlugin = {
  name: "historical-markdown-parser-baseline",
  enforce: "pre",
  load(id) {
    return originals.get(id) ?? null
  },
}
await bundle({
  entryPoints: [path.join(repo, ".internal/experiments/markdown-rust/electron/backend.ts")],
  bundle: true,
  platform: "node",
  format: "cjs",
  outfile: "/tmp/ax-coder-native-markdown-backend.cjs",
})
if (process.argv.includes("--backend-only")) process.exit(0)
await build({
  configFile: path.join(repo, "desktop/packages/web/vite.config.ts"),
  worker: { plugins: () => [baselinePlugin] },
  plugins: [
    baselinePlugin,
    {
      name: "mark-prepared-markdown-commit",
      enforce: "pre",
      load(id) {
        if (id === path.join(repo, "desktop/packages/ui/src/components/chat/PreparedMarkdown.tsx")) {
          return readFileSync(id, "utf8").replace(
            "    if (block.plain)",
            `    React.useLayoutEffect(() => {
      const revision = !block.plain && block.src.match(/END_([0-9]+)/)?.[1]
      if (revision) {
        const viewport = document.querySelector('[data-markdown-probe]')
        if (viewport) viewport.scrollTop = viewport.scrollHeight
        performance.mark('ax-markdown:commit:' + revision)
      }
    }, [block])
    if (block.plain)`,
          )
        }
      },
    },
  ],
  build: {
    outDir: `/tmp/ax-coder-native-markdown-${baseline ? "baseline" : "candidate"}-dist`,
    emptyOutDir: true,
    rollupOptions: { input: path.join(repo, "desktop/packages/web/native-markdown-perf/renderer.html") },
  },
})
