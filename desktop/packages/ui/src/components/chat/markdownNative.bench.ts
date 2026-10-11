/** Benchmark-only native parser comparison. No desktop integration or GUI latency claims.
 * cargo build --release --locked --manifest-path .internal/experiments/markdown-rust/Cargo.toml
 * pnpm --dir desktop/packages/ui exec tsx src/components/chat/markdownNative.bench.ts
 */
import assert from "node:assert/strict"
import { spawn } from "node:child_process"
import { once } from "node:events"
import { cpus } from "node:os"
import { createInterface } from "node:readline"
import { fileURLToPath } from "node:url"
import { unified } from "unified"
import remarkParse from "remark-parse"
import remarkGfm from "remark-gfm"
import remarkMath from "remark-math"
import { createElement } from "react"
import { renderToStaticMarkup } from "react-dom/server"
import type { Root } from "mdast"
import { PreparedMarkdown } from "./PreparedMarkdown"
import { buildFullMarkdownBlock, buildLiveMarkdownBlocks } from "./markdownStreamBlocks"

const parser = unified().use(remarkParse).use(remarkGfm).use(remarkMath)
const binary = fileURLToPath(
  new URL(
    "../../../../../../.internal/experiments/markdown-rust/target/release/ax-coder-markdown-bench",
    import.meta.url,
  ),
)
const child = spawn(binary, [], { stdio: ["pipe", "pipe", "inherit"] })
const lines = createInterface({ input: child.stdout })[Symbol.asyncIterator]()
const timeout = setTimeout(() => {
  child.kill()
  throw new Error("Native benchmark timed out")
}, 120_000)
const request = async (sources: string[]) => {
  const started = performance.now()
  child.stdin.write(`${JSON.stringify({ sources })}\n`)
  const line = await lines.next()
  assert.equal(line.done, false, "Native parser exited before a response")
  const result = JSON.parse(line.value!) as { trees: Root[]; parseMs: number }
  return { ...result, roundTripMs: performance.now() - started }
}
// Positions and math renderer metadata are audited separately; this comparison
// checks semantic fields, including links, identifiers, tables and task states.
const semantic = (value: unknown): unknown => {
  if (Array.isArray(value)) return value.map(semantic)
  if (value && typeof value === "object")
    return Object.fromEntries(
      Object.entries(value)
        .filter(([key, entry]) => key !== "position" && key !== "data" && entry != null)
        .map(([key, entry]) => [key, semantic(entry)]),
    )
  return value
}
const p95 = (samples: number[]) => [...samples].sort((a, b) => a - b)[Math.ceil(samples.length * 0.95) - 1]
const positions = (value: unknown): unknown => {
  if (Array.isArray(value)) return value.map(positions)
  if (value && typeof value === "object") {
    const node = value as { position?: unknown; children?: unknown[] }
    return { position: node.position, children: node.children?.map(positions) }
  }
  return undefined
}
const equal = (a: unknown, b: unknown) => {
  try {
    assert.deepEqual(a, b)
    return true
  } catch {
    return false
  }
}
const firstDifference = (a: unknown, b: unknown, path = "root"): unknown => {
  if (equal(a, b)) return undefined
  if (a && b && typeof a === "object" && typeof b === "object") {
    const left = a as Record<string, unknown>,
      right = b as Record<string, unknown>
    for (const key of new Set([...Object.keys(left), ...Object.keys(right)])) {
      const difference = firstDifference(left[key], right[key], `${path}.${key}`)
      if (difference !== undefined) return difference
    }
  }
  return { path, js: a, rust: b }
}
const fixtures = [
  { name: "small", text: "# Hello\n\nA **bold** [link](https://example.com).", live: false },
  { name: "paragraph-200kb", text: "Streaming text with **bold** words and `code`. ".repeat(4500), live: true },
  {
    name: "blocks-200kb",
    text: "## Section\n\nA **bold** paragraph with [link](https://example.com).\n\n".repeat(3000),
    live: true,
  },
  {
    name: "gfm-math",
    text: "| a | b |\n| - | - |\n| 1 | 2 |\n\n- [x] done\n- [ ] pending\n\n~strike~ ~~strike~~ https://example.com\n\nInline $x^2$ and $$y$$.\n\n$$\nx^2\n$$\n\nNote[^a].\n\n[^a]: Footnote",
    live: false,
  },
  {
    name: "unicode-entities",
    text: "繁體中文 😀 &amp; &#x1F600; &unknown;\n\n[中文](./路徑.ts)\n\n```ts\nconst x = '😀'\n```",
    live: false,
  },
  {
    name: "unsafe-html",
    text: "<script>alert(1)</script>\n\n[x](javascript:alert) ![x](file:///tmp/x)\n\n<https://example.com>",
    live: false,
  },
  { name: "live-fence", text: "Intro\n\n```mermaid\ngraph TD; A-->B", live: true },
  { name: "live-link", text: "Intro\n\n**bold and [unfinished](https://example", live: true },
  { name: "references", text: "[first][ref]\n\n[ref]: ./file.ts\n\nTail", live: true },
]
try {
  await once(child, "spawn")
  const results = []
  for (const fixture of fixtures) {
    if (process.argv[2] === "--compatibility-only" && fixture.text.length >= 16_384) continue
    const splitStart = performance.now()
    const blocks = fixture.live
      ? buildLiveMarkdownBlocks(fixture.text, "bench").blocks
      : [buildFullMarkdownBlock(fixture.text, "bench")]
    const projectionMs = performance.now() - splitStart
    const sources = blocks.map((block) => block.src)
    const jsSamples: number[] = [],
      cloneSamples: number[] = [],
      nativeSamples: number[] = [],
      tripSamples: number[] = []
    let jsTrees: Root[] = [],
      nativeTrees: Root[] = []
    for (let index = 0; index < 23; index++) {
      const js = () => {
        const start = performance.now()
        jsTrees = sources.map((source) => parser.parse(source))
        const parsed = performance.now()
        structuredClone(jsTrees)
        const cloned = performance.now()
        if (index >= 3) {
          jsSamples.push(parsed - start)
          cloneSamples.push(cloned - start)
        }
      }
      const native = async () => {
        const result = await request(sources)
        nativeTrees = result.trees
        if (index >= 3) {
          nativeSamples.push(result.parseMs)
          tripSamples.push(result.roundTripMs)
        }
      }
      if (index % 2) {
        await native()
        js()
      } else {
        js()
        await native()
      }
    }
    const semanticEqual = equal(semantic(nativeTrees), semantic(jsTrees))
    assert.equal(semanticEqual, true, `Semantic mismatch: ${fixture.name}`)
    const positionsEqual = equal(positions(nativeTrees), positions(jsTrees))
    assert.equal(
      positionsEqual,
      !["unicode-entities", "gfm-math"].includes(fixture.name),
      `Unexpected positions: ${fixture.name}`,
    )
    const render = (trees: Root[]) =>
      blocks
        .map((block, index) =>
          renderToStaticMarkup(
            createElement(PreparedMarkdown, { block: { ...block, tree: trees[index] }, components: {} }),
          ),
        )
        .join("")
    const renderedEqual = render(nativeTrees) === render(jsTrees)
    // Raw native output is not a drop-in replacement: deliberately expose the
    // known math metadata and Unicode location differences instead of hiding them.
    assert.equal(renderedEqual, fixture.name !== "gfm-math", `Unexpected rendering result: ${fixture.name}`)
    const row = {
      name: fixture.name,
      characters: fixture.text.length,
      blocks: blocks.length,
      projectionMs,
      jsParseP95Ms: p95(jsSamples),
      jsParseAndCloneP95Ms: p95(cloneSamples),
      rustParseP95Ms: p95(nativeSamples),
      rustPipeAndDecodeP95Ms: p95(tripSamples),
      semanticEqual,
      renderedEqual,
      jsSamples,
      cloneSamples,
      nativeSamples,
      tripSamples,
      mathMetadataEqual:
        JSON.stringify(nativeTrees).includes('"hName"') === JSON.stringify(jsTrees).includes('"hName"'),
      positionsEqual,
      positionDifference: firstDifference(positions(jsTrees), positions(nativeTrees)),
      rootPositionDifference: positionsEqual ? undefined : { js: jsTrees[0].position, rust: nativeTrees[0].position },
    }
    results.push(row)
    console.error(
      JSON.stringify({
        ...row,
        jsSamples: undefined,
        cloneSamples: undefined,
        nativeSamples: undefined,
        tripSamples: undefined,
      }),
    )
  }
  console.log(
    JSON.stringify(
      {
        node: process.version,
        platform: process.platform,
        arch: process.arch,
        cpu: cpus()[0].model,
        warmups: 3,
        samples: 20,
        results,
      },
      null,
      2,
    ),
  )
} finally {
  clearTimeout(timeout)
  child.stdin.end()
  child.kill()
  lines.return?.()
}
