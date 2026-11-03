import assert from "node:assert/strict"
import { execFileSync } from "node:child_process"
import { mkdtemp, rm, symlink, writeFile } from "node:fs/promises"
import os from "node:os"
import path from "node:path"
import { pathToFileURL } from "node:url"
import * as currentBlocks from "../../../desktop/packages/ui/src/components/chat/markdownStreamBlocks"
import * as currentParser from "../../../desktop/packages/ui/src/components/chat/markdownWorkerParser"

// Run from repository root with the immutable pre-change commit as the argument.
// Both variants use the current installed dependencies and the same Node process.
const ref = process.argv[2]
if (!ref || !/^[0-9a-f]{40}$/.test(ref)) throw new Error("Pass a full baseline commit SHA")
const root = process.cwd()
const temporary = await mkdtemp(path.join(os.tmpdir(), "ax-markdown-baseline-"))
const median = (samples: number[]) => [...samples].sort((a, b) => a - b)[Math.floor(samples.length / 2)]
try {
  await writeFile(path.join(temporary, "package.json"), '{"type":"module"}\n')
  await symlink(path.join(root, "desktop/packages/ui/node_modules"), path.join(temporary, "node_modules"))
  for (const name of ["markdownStreamBlocks", "markdownWorkerParser"]) {
    const source = execFileSync("git", ["show", `${ref}:desktop/packages/ui/src/components/chat/${name}.ts`], {
      cwd: root,
      encoding: "utf8",
    })
    await writeFile(path.join(temporary, `${name}.ts`), source)
  }
  const baselineBlocks: typeof currentBlocks = await import(
    pathToFileURL(path.join(temporary, "markdownStreamBlocks.ts")).href
  )
  const baselineParser: typeof currentParser = await import(
    pathToFileURL(path.join(temporary, "markdownWorkerParser.ts")).href
  )
  console.log(
    JSON.stringify({
      baseline: ref,
      node: process.version,
      platform: process.platform,
      cpu: os.cpus()[0].model,
      samples: 5,
      warmups: 1,
      note: "Synthetic Node medians/max; not packaged UI latency. Same installed dependencies; alternating order; forced GC before samples if exposed.",
    }),
  )
  const workloads = [
    {
      name: "small-inline",
      text: "Text **bold** and [a link](https://example.com) with `code`.\n\n".repeat(60) + "Tail",
    },
    {
      name: "many-blocks-100k",
      text: "## Title\n\nText **bold** with [link](https://example.com).\n\n".repeat(1700) + "Tail",
    },
    {
      name: "many-blocks-500k",
      text: "## Title\n\nText **bold** with [link](https://example.com).\n\n".repeat(8500) + "Tail",
    },
    { name: "open-fence-500k", text: "```typescript\n" + "const value = compute(input); // example\n".repeat(12500) },
    {
      name: "references",
      text: "Text **bold** with [reference].\n\n".repeat(300) + "[reference]: https://example.com",
    },
  ]
  for (const workload of workloads) {
    const request = { id: 1, ownerId: 1, baseKey: "benchmark", live: true, text: workload.text }
    assert.deepEqual(
      currentParser.createMarkdownWorkerResponder()(request),
      baselineParser.createMarkdownWorkerResponder()(request),
    )
    const variants = [
      { label: "baseline", blocks: baselineBlocks, parser: baselineParser },
      { label: "current", blocks: currentBlocks, parser: currentParser },
    ]
    const samples: Record<string, Record<string, number[]>> = Object.fromEntries(
      variants.map(({ label }) => [label, { lex: [], fresh: [], append: [], final: [], clone: [] }]),
    )
    // Alternate execution order to reduce drift bias. Optional forced GC is outside
    // timings and isolates previous samples; these remain kernel measurements.
    for (let run = 0; run < 6; run++) {
      for (const { label, blocks, parser } of run % 2 ? [...variants].reverse() : variants) {
        const collect = Reflect.get(globalThis, "gc")
        if (typeof collect === "function") collect()
        let start = performance.now()
        blocks.buildLiveMarkdownBlocks(request.text, request.baseKey)
        const lex = performance.now() - start
        const respond = parser.createMarkdownWorkerResponder()
        start = performance.now()
        const first = respond(request)
        const fresh = performance.now() - start
        start = performance.now()
        respond({ ...request, id: 2, baseRevision: 1, text: request.text + " next" })
        const append = performance.now() - start
        start = performance.now()
        respond({ ...request, id: 3, live: false })
        const final = performance.now() - start
        start = performance.now()
        structuredClone(first)
        const clone = performance.now() - start
        if (run > 0)
          for (const [key, value] of Object.entries({ lex, fresh, append, final, clone }))
            samples[label][key].push(value)
      }
    }
    const results = Object.fromEntries(
      Object.entries(samples).map(([label, phases]) => [
        label,
        Object.fromEntries(
          Object.entries(phases).map(([key, values]) => [
            key,
            { medianMs: median(values), maxMs: Math.max(...values) },
          ]),
        ),
      ]),
    )
    console.log(JSON.stringify({ workload: workload.name, characters: workload.text.length, results }))
  }
} finally {
  await rm(temporary, { recursive: true, force: true })
}
