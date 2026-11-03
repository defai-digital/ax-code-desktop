import { performance } from "node:perf_hooks"
import { pathToFileURL } from "node:url"
const root = process.cwd()
const { createMarkdownWorkerResponder } = await import(
  pathToFileURL(root + "/desktop/packages/ui/src/components/chat/markdownWorkerParser.ts").href
)
const median = (xs: number[]) => [...xs].sort((a, b) => a - b)[Math.floor(xs.length / 2)]
for (const kind of ["many-blocks", "open-code-fence"])
  for (const size of [16000, 100000, 500000]) {
    const unit =
      kind === "many-blocks"
        ? "## Title\n\nText **bold** with [link](https://example.com).\n\n"
        : "const value = compute(input); // example\n"
    const text = (kind === "open-code-fence" ? "```typescript\n" : "") + unit.repeat(Math.ceil(size / unit.length))
    const times: { fresh: number[]; append: number[]; clone: number[] } = { fresh: [], append: [], clone: [] }
    let count = 0
    let suffix = 0
    for (let run = 0; run < 5; run++) {
      const respond = createMarkdownWorkerResponder()
      let start = performance.now()
      const first = respond({ id: 1, ownerId: 1, baseKey: "probe", live: true, text })
      const fresh = performance.now() - start
      start = performance.now()
      const second = respond({ id: 2, ownerId: 1, baseRevision: 1, baseKey: "probe", live: true, text: text + "next" })
      const append = performance.now() - start
      start = performance.now()
      structuredClone(second)
      const clone = performance.now() - start
      if (run > 0) {
        times.fresh.push(fresh)
        times.append.push(append)
        times.clone.push(clone)
      }
      count = first.blocks.length
      suffix = second.blocks.length
    }
    console.log(
      JSON.stringify({
        case: "markdown-current-js",
        kind,
        characters: text.length,
        blocks: count,
        returnedSuffixBlocks: suffix,
        freshMedianMs: median(times.fresh),
        appendMedianMs: median(times.append),
        responseCloneMedianMs: median(times.clone),
        note: "1 warmup + 4 measurements; synthetic Node same-thread responder and clone proxy, no actual worker/React/paint. No WASM parser comparison.",
      }),
    )
  }
