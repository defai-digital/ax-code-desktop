// Node compute/transfer measurements, not packaged UI latency percentiles.
import assert from "node:assert/strict"
import { readFile } from "node:fs/promises"
import os from "node:os"
import { resolve } from "node:path"
import { pathToFileURL } from "node:url"

if (!process.argv[2]) throw new Error("Usage: node benchmark.mjs <canonical-dist/node.js>")
const pierrePackage = new URL("../../../desktop/packages/ui/node_modules/@pierre/diffs/package.json", import.meta.url)
const manifest = JSON.parse(await readFile(pierrePackage, "utf8"))
const { parseDiffFromFile, processFile } = await import(new URL(manifest.exports["."].import, pierrePackage).href)
const { createDiffEngine } = await import(pathToFileURL(resolve(process.argv[2])).href)
const engine = createDiffEngine()
const results = []
const median = (values) => [...values].sort((a, b) => a - b)[Math.floor(values.length / 2)]
const patchText = (preview) =>
  "--- fixture.txt\n+++ fixture.txt\n" +
  preview.hunks
    .map((hunk) => {
      const range = (start, count) => `${count === 0 ? start - 1 : start},${count}`
      return `@@ -${range(hunk.oldStart, hunk.oldLines)} +${range(hunk.newStart, hunk.newLines)} @@\n${hunk.lines.join("\n")}\n`
    })
    .join("")
try {
  const coldStart = performance.now()
  await engine.diff("before\n", "after\n")
  const firstCallMs = performance.now() - coldStart
  for (const count of [1000, 10000, 50000]) {
    for (const stride of [count - 5, 50]) {
      const lines = Array.from({ length: count }, (_, index) => `line ${index}: repeated text 中文 😀\r\n`)
      const changed = lines.map((line, index) => (index % stride === 2 ? `changed ${index}\r\n` : line))
      const oldFile = { name: "fixture.txt", contents: lines.join("") }
      const newFile = { name: "fixture.txt", contents: changed.join("") }
      const modes = {
        pierre: () => parseDiffFromFile(oldFile, newFile, undefined, true),
        wasmAndMetadata: async () =>
          processFile(patchText(await engine.diff(oldFile.contents, newFile.contents)), {
            oldFile,
            newFile,
            throwOnError: true,
          }),
      }
      const expected = modes.pierre()
      try {
        assert.deepEqual(await modes.wasmAndMetadata(), expected)
      } catch (error) {
        if (!String(error).includes("Diff resource limit exceeded")) throw error
        assert.equal((await engine.diff("a\n", "b\n")).additions, 1)
        results.push({
          lines: count,
          stride,
          beforeCharacters: oldFile.contents.length,
          rejected: String(error),
          workerRecoveredAfterLimit: true,
        })
        continue
      }
      const samples = { pierre: [], wasmAndMetadata: [] }
      for (let iteration = 0; iteration < 7; iteration++) {
        const order = iteration % 2 ? ["wasmAndMetadata", "pierre"] : ["pierre", "wasmAndMetadata"]
        for (const mode of order) {
          const start = performance.now()
          const result = await modes[mode]()
          samples[mode].push(performance.now() - start)
          assert.deepEqual(result, expected)
        }
      }
      results.push({
        lines: count,
        stride,
        beforeCharacters: oldFile.contents.length,
        hunks: expected.hunks.length,
        samples,
        medianMs: Object.fromEntries(Object.entries(samples).map(([key, values]) => [key, median(values)])),
      })
    }
  }
  console.log(
    JSON.stringify(
      {
        node: process.version,
        cpu: os.cpus()[0]?.model,
        load: os.loadavg(),
        firstCallMs,
        notes:
          "Seven alternating warm samples; canonical includes Worker transfer and synchronous Pierre metadata projection. Excludes UI rendering, scheduling, cache hits and browser startup. No p95 or app-wide speed claim.",
        results,
      },
      null,
      2,
    ),
  )
} finally {
  await engine.close()
}
