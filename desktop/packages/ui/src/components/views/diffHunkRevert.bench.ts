/**
 * Controlled CPU microbenchmark of the synchronous hunk work that runs on the renderer
 * thread: getFileHunks (DiffHunkReviewList memo, usePublishReviewHunks effect) and
 * revertHunk (hunk revert click). Not a renderer/FPS benchmark; it sizes the main-thread
 * block that a Worker-hosted diff engine would remove.
 * Run: pnpm run bench:diff-hunks
 */
import assert from "node:assert/strict"
import { clearFileHunkCache, getFileHunks, revertHunk } from "./diffHunkRevert"

const SAMPLES = 7

interface Fixture {
  name: string
  original: string
  modified: string
}

const line = (index: number, width = 48) => `const value_${index} = compute(${index}) // ${"x".repeat(width)}`

/** `lines` source lines; every `every`-th line is edited, giving roughly lines/every hunks. */
const scattered = (name: string, lines: number, every: number, width?: number): Fixture => {
  const before = Array.from({ length: lines }, (_, index) => line(index, width))
  const after = before.map((text, index) => (index % every === every - 1 ? `${text} // edited` : text))
  return { name, original: `${before.join("\n")}\n`, modified: `${after.join("\n")}\n` }
}

const rewrite = (name: string, lines: number): Fixture => {
  const before = Array.from({ length: lines }, (_, index) => line(index))
  const after = Array.from({ length: lines }, (_, index) => `let rewritten_${index} = ${index * 7}`)
  return { name, original: `${before.join("\n")}\n`, modified: `${after.join("\n")}\n` }
}

const FIXTURES: Fixture[] = [
  scattered("2k lines, 3 edits", 2_000, 700),
  scattered("10k lines, ~100 hunks", 10_000, 100),
  scattered("20k lines, ~400 hunks (fragmented)", 20_000, 50),
  scattered("50k lines, ~500 hunks", 50_000, 100),
  scattered("300 lines x 4k chars, ~30 hunks", 300, 10, 4_000),
  rewrite("500 lines, full rewrite", 500),
  rewrite("1k lines, full rewrite", 1_000),
  rewrite("2k lines, full rewrite", 2_000),
  rewrite("5k lines, full rewrite", 5_000),
]

const time = (run: () => void): number => {
  const start = performance.now()
  run()
  return performance.now() - start
}

const stats = (values: number[]) => {
  const sorted = [...values].sort((a, b) => a - b)
  return { median: sorted[Math.floor(sorted.length / 2)], max: sorted[sorted.length - 1] }
}

const format = (value: number) => value.toFixed(1).padStart(8)

console.log("fixture".padEnd(38), "chars".padStart(9), "hunks".padStart(6), "  parse p50/max ms", "  cached p50 ms", "  revert p50/max ms")
for (const fixture of FIXTURES) {
  // Warm up the parser's JIT on this shape before measuring.
  clearFileHunkCache()
  const hunks = getFileHunks(fixture.original, fixture.modified, "bench.ts")
  assert.ok(hunks.length > 0, `${fixture.name} produced no hunks`)

  const parse: number[] = []
  const cached: number[] = []
  const revert: number[] = []
  const middle = Math.floor(hunks.length / 2)
  for (let sample = 0; sample < SAMPLES; sample += 1) {
    clearFileHunkCache()
    parse.push(time(() => getFileHunks(fixture.original, fixture.modified, "bench.ts")))
    // A cache hit still hashes both full texts to build its key.
    cached.push(time(() => getFileHunks(fixture.original, fixture.modified, "bench.ts")))
    let reverted = ""
    revert.push(time(() => (reverted = revertHunk(fixture.original, fixture.modified, middle, "bench.ts"))))
    assert.notEqual(reverted, fixture.modified, `${fixture.name} revert changed nothing`)
  }
  const p = stats(parse)
  const r = stats(revert)
  console.log(
    fixture.name.padEnd(38),
    String(fixture.original.length + fixture.modified.length).padStart(9),
    String(hunks.length).padStart(6),
    `${format(p.median)} /${format(p.max)}`,
    `${format(stats(cached).median)}     `,
    `${format(r.median)} /${format(r.max)}`,
  )
}
