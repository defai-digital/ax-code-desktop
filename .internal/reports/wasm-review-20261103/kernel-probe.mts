import { createRequire } from "node:module"
import { pathToFileURL } from "node:url"
import { createHash } from "node:crypto"
import { performance } from "node:perf_hooks"
import os from "node:os"
import { realpathSync } from "node:fs"
const root = process.cwd()
const req = createRequire(root + "/desktop/packages/ui/package.json")
const diffReq = createRequire(realpathSync(root + "/desktop/packages/ui/node_modules/@pierre/diffs/package.json"))
const imp = (id: string) => import(pathToFileURL(diffReq.resolve(id)).href)
const { createHighlighter } = await imp("shiki")
const { createJavaScriptRegexEngine } = await imp("shiki/engine/javascript")
const { createOnigurumaEngine } = await imp("shiki/engine/oniguruma")
const median = (a: number[]) => [...a].sort((a, b) => a - b)[Math.floor(a.length / 2)]
const hash = (x: unknown) => createHash("sha256").update(JSON.stringify(x)).digest("hex")
console.log(
  JSON.stringify({
    case: "environment",
    node: process.version,
    platform: process.platform,
    arch: process.arch,
    cpu: os.cpus()[0].model,
    shikiEntry: diffReq.resolve("shiki"),
    note: "Synthetic Node CPU probe, not Electron UI latency or cold-process startup. 2 warmups + 7 measurements per case.",
  }),
)
interface ProbeHighlighter {
  codeToTokens(code: string, options: { lang: string; theme: string }): { tokens: unknown }
  dispose(): void
}
const engines: Record<string, ProbeHighlighter> = {}
for (const name of ["js", "wasm"]) {
  const start = performance.now()
  engines[name] = await createHighlighter({
    themes: ["github-dark"],
    langs: ["typescript", "json"],
    engine: name === "js" ? createJavaScriptRegexEngine() : createOnigurumaEngine(imp("shiki/wasm")),
  })
  console.log(
    JSON.stringify({
      case: "highlighter-initialize-single-process",
      engine: name,
      ms: performance.now() - start,
      note: "Sequential imports/cache reuse; not a fair cold-start comparison.",
    }),
  )
}
for (const [lang, unit] of [
  ["typescript", "export function compute(input: number): string { return `value=${input * 2}` } // example\n"],
  ["json", '{"name":"example", "items":[1,2,3],"active":true}\n'],
]) {
  for (const n of [50, 500, 2000]) {
    const code = unit.repeat(n)
    const results: Record<string, unknown> = {}
    for (const name of n === 500 ? ["wasm", "js"] : ["js", "wasm"]) {
      const times = []
      let tokens
      for (let run = 0; run < 9; run++) {
        const start = performance.now()
        tokens = engines[name].codeToTokens(code, { lang, theme: "github-dark" }).tokens
        if (run >= 2) times.push(performance.now() - start)
      }
      results[name] = { medianMs: median(times), maxMs: Math.max(...times), tokenHash: hash(tokens) }
    }
    console.log(JSON.stringify({ case: "highlight-warm", lang, characters: code.length, results }))
  }
}
for (const highlighter of Object.values(engines)) highlighter.dispose()
const { default: Fuse } = await import(pathToFileURL(req.resolve("fuse.js")).href)
for (const n of [1000, 10000, 50000]) {
  const texts = Array.from(
    { length: n },
    (_, i) => `project-${i}/src/components/ProjectSessionController-${i % 93}.tsx`,
  )
  const options = { threshold: 0.3, ignoreLocation: true, distance: 100, includeScore: true, minMatchCharLength: 2 }
  const index = new Fuse(texts, options)
  const results: Record<string, unknown> = {}
  for (const name of ["rebuild", "reuse"]) {
    const times = []
    let ids
    for (let run = 0; run < 9; run++) {
      const start = performance.now()
      const found = (name === "rebuild" ? new Fuse(texts, options) : index).search("sesioncontrler")
      ids = found.map((x: { refIndex: number }) => x.refIndex)
      if (run >= 2) times.push(performance.now() - start)
    }
    results[name] = { medianMs: median(times), maxMs: Math.max(...times), resultHash: hash(ids) }
  }
  console.log(
    JSON.stringify({
      case: "fuse-index-proxy",
      items: n,
      results,
      note: "Direct Fuse proxy; does not include production substring priority, top-N sort, React or worker transfer.",
    }),
  )
}
