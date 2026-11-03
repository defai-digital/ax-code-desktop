// Read-only qualification against an explicitly supplied canonical build.
// This is not a Desktop runtime dependency or a replacement diff kernel.
import assert from "node:assert/strict"
import { execFileSync } from "node:child_process"
import { createHash } from "node:crypto"
import { readFile, readdir } from "node:fs/promises"
import { resolve } from "node:path"
import { pathToFileURL } from "node:url"
import { isDeepStrictEqual } from "node:util"

const enginePath = process.argv[2]
if (!enginePath) throw new Error("Usage: node probe.mjs <canonical-dist/node.js>")
const pierrePackage = new URL("../../../desktop/packages/ui/node_modules/@pierre/diffs/package.json", import.meta.url)
const pierreManifest = JSON.parse(await readFile(pierrePackage, "utf8"))
const { parseDiffFromFile, processFile, diffAcceptRejectHunk } = await import(
  new URL(pierreManifest.exports["."].import, pierrePackage).href
)
const { createDiffEngine } = await import(pathToFileURL(resolve(enginePath)).href)
const fixtures = []
const desktopSnapshot = "fdc39c9f53b2ffe346e99775a0acece541f06dc9"
for (const file of [
  "desktop/packages/ui/src/components/views/DiffView.tsx",
  "desktop/packages/ui/src/components/views/diffHunkRevert.ts",
  "desktop/packages/ui/src/components/chat/markdownStreamBlocks.ts",
]) {
  const source = execFileSync("git", ["show", `${desktopSnapshot}:${file}`], {
    cwd: new URL("../../../", import.meta.url),
    encoding: "utf8",
  })
  for (const newline of ["\n", "\r\n"]) {
    const lines = source.split("\n")
    const changed = [...lines]
    changed.splice(Math.floor(lines.length / 4), 1, "qualification replacement 中文😀")
    changed.splice(Math.floor(lines.length / 2), 0, "qualification insertion")
    changed.splice(Math.floor((lines.length * 3) / 4), 2)
    fixtures.push({
      name: `source-${file}-${JSON.stringify(newline)}`,
      before: lines.join(newline),
      after: changed.join(newline),
    })
  }
}
const atoms = ["", "a", "a\n", "a\r\n", "\n", "\r", "中文😀\r\nb", "a\nb\nc\n", "\0"]
fixtures.push(
  {
    name: "patch-like-lines",
    before: "--- a\n+++ b\n@@ -1,2 +1,2 @@\n\\ No newline at end of file\n",
    after: "--- b\n+++ b\n@@ -1,2 +1,2 @@\n\\ No newline at end of file",
  },
  { name: "mixed-endings", before: "a\r\nb\nc\rd\n", after: "a\nchanged\r\nc\rd" },
  {
    name: "long-line",
    before: "a".repeat(300_000) + "\r\n",
    after: "a".repeat(150_000) + "中文😀" + "a".repeat(150_000),
  },
  {
    name: "nontrivial-missing-final-newline",
    before: Array.from({ length: 200 }, (_, i) => `line ${i}`).join("\r\n"),
    after: Array.from({ length: 200 }, (_, i) => (i === 30 || i === 175 ? `change ${i}` : `line ${i}`)).join("\r\n"),
  },
)
for (const [left, before] of atoms.entries()) {
  for (const [right, after] of atoms.entries()) fixtures.push({ name: `edge-${left}-${right}`, before, after })
}
for (const newline of ["\n", "\r\n"]) {
  for (const gap of [1, 4, 7, 8, 9, 12, 30]) {
    const lines = Array.from({ length: 64 }, (_, index) => `line ${index}${newline}`)
    const after = [...lines]
    after[5] = `first edit${newline}`
    after[6 + gap] = `second edit${newline}`
    fixtures.push({ name: `gap-${JSON.stringify(newline)}-${gap}`, before: lines.join(""), after: after.join("") })
  }
}
let seed = 0xabc123
const random = (limit) => {
  seed ^= seed << 13
  seed ^= seed >>> 17
  seed ^= seed << 5
  return (seed >>> 0) % limit
}
for (let index = 0; index < 120; index++) {
  const newline = index % 2 ? "\r\n" : "\n"
  const lines = Array.from({ length: 40 + random(100) }, () => `repeat ${random(12)} 中文😀${newline}`)
  const after = [...lines]
  for (let change = 0; change < 4; change++) {
    after.splice(
      random(after.length),
      random(3),
      ...Array.from({ length: random(4) }, () => `changed ${random(10)}${newline}`),
    )
  }
  fixtures.push({ name: `seeded-${index}`, before: lines.join(""), after: after.join("") })
}

// Adapt only the documented unified header convention: canonical empty ranges
// are one-based; unified patch headers name the line before an empty range.
function patchText(preview) {
  const range = (start, count) => `${count === 0 ? start - 1 : start},${count}`
  return (
    "--- fixture.txt\n+++ fixture.txt\n" +
    preview.hunks
      .map(
        (hunk) =>
          `@@ -${range(hunk.oldStart, hunk.oldLines)} +${range(hunk.newStart, hunk.newLines)} @@\n${hunk.lines.join("\n")}\n`,
      )
      .join("")
  )
}
const spans = (hunks) =>
  hunks.map((hunk) => [hunk.deletionStart, hunk.deletionCount, hunk.additionStart, hunk.additionCount])
const equal = (a, b) => JSON.stringify(a) === JSON.stringify(b)
const engine = createDiffEngine()
const results = []
const failures = []
let subsetCases = 0
try {
  for (const { name, before, after } of fixtures) {
    try {
      const oldFile = { name: "fixture.txt", contents: before }
      const newFile = { name: "fixture.txt", contents: after }
      const pierre = parseDiffFromFile(oldFile, newFile, undefined, true)
      const preview = await engine.diff(before, after)
      let oldEnd = 1
      let newEnd = 1
      for (const hunk of preview.hunks) {
        assert.ok(hunk.oldStart >= oldEnd && hunk.newStart >= newEnd, `${name}: ordered non-overlapping ranges`)
        oldEnd = hunk.oldStart + hunk.oldLines
        newEnd = hunk.newStart + hunk.newLines
      }
      assert.equal(await engine.applyHunks(before, preview.hunks), after, `${name}: full forward apply`)
      const adapted = processFile(patchText(preview), { oldFile, newFile, throwOnError: true })
      assert.ok(adapted, `${name}: public processFile must produce metadata`)
      assert.equal(adapted.isPartial, false)
      assert.equal(adapted.additionLines.join(""), after)
      assert.equal(adapted.deletionLines.join(""), before)
      const sameSpans = equal(spans(adapted.hunks), spans(pierre.hunks))
      let sameReverts = sameSpans
      for (let excluded = 0; excluded < preview.hunks.length; excluded++) {
        // Forward complement onto the original snapshot; this is coordinate
        // adaptation only. The canonical engine still validates and applies it.
        let delta = 0
        const subset = []
        for (const [index, hunk] of preview.hunks.entries()) {
          if (index === excluded) continue
          subset.push({ ...hunk, newStart: hunk.oldStart + delta })
          delta += hunk.newLines - hunk.oldLines
        }
        const reconstructed = await engine.applyHunks(before, subset)
        const adapterRevert = diffAcceptRejectHunk(adapted, excluded, "reject").additionLines.join("")
        assert.equal(reconstructed, adapterRevert, `${name}: precomputed renderer/revert identity`)
        if (sameSpans) {
          const existingRevert = diffAcceptRejectHunk(pierre, excluded, "reject").additionLines.join("")
          sameReverts &&= reconstructed === existingRevert
        }
        subsetCases++
      }
      results.push({
        name,
        hunks: preview.hunks.length,
        sameSpans,
        sameReverts,
        sameMetadata: isDeepStrictEqual(adapted, pierre),
        ...(sameSpans ? {} : { canonical: spans(adapted.hunks), pierre: spans(pierre.hunks) }),
      })
    } catch (error) {
      failures.push({ name, error: String(error) })
    }
  }
  const strict = await engine.diff("old\n", "new\n")
  await assert.rejects(engine.applyHunks("stale\n", strict.hunks), /mismatched/)
  await assert.rejects(engine.applyHunks("old\n", [{ ...strict.hunks[0], newStart: 2 }]), /mismatched/)
  await assert.rejects(engine.applyHunks("old\n", [{ ...strict.hunks[0], oldLines: 2 }]), /mismatched/)
  await assert.rejects(engine.applyHunks("old\n", [...strict.hunks, ...strict.hunks]), /mismatched/)
  await assert.rejects(engine.diff("\ud800", "valid"), /well-formed/)
  const normalized = await engine.diff("old\r\n", "new\r\n", { normalize: true })
  assert.equal(await engine.applyHunks("old\n", normalized.hunks), "new\n")
  await assert.rejects(engine.applyHunks("old\r\n", normalized.hunks), /mismatched/)
  const controller = new AbortController()
  controller.abort()
  await assert.rejects(engine.diff("a", "b", { signal: controller.signal }), { name: "AbortError" })
  assert.equal((await engine.diff("a\n", "b\n")).additions, 1)
} finally {
  await engine.close()
}
const runtimeAssetsSha256 = {}
for (const relative of [".", "../wasm"]) {
  const directory = new URL(`${relative}/`, pathToFileURL(resolve(enginePath)))
  for (const name of await readdir(directory)) {
    if (!/\.(js|wasm)$/.test(name)) continue
    runtimeAssetsSha256[`${relative}/${name}`] = createHash("sha256")
      .update(await readFile(new URL(name, directory)))
      .digest("hex")
  }
}
const report = {
  node: process.version,
  desktopSnapshot,
  pierreVersion: pierreManifest.version,
  fixtureSha256: createHash("sha256").update(JSON.stringify(fixtures)).digest("hex"),
  runtimeAssetsSha256,
  engineSha256: createHash("sha256")
    .update(await readFile(enginePath))
    .digest("hex"),
  fixtures: fixtures.length,
  successful: results.length,
  fullForwardRoundTrips: results.length,
  rendererSubsetRevertCases: subsetCases,
  identicalSpans: results.filter((result) => result.sameSpans).length,
  identicalFullMetadata: results.filter((result) => result.sameMetadata).length,
  hunkBearingFixtures: results.filter((result) => result.hunks > 0).length,
  multiHunkFixtures: results.filter((result) => result.hunks > 1).length,
  identicalRevertsWhenSpansMatch: results.filter((result) => result.hunks > 0 && result.sameReverts).length,
  strictStaleContextRejected: true,
  malformedCoordinatesCountsAndOverlapRejected: true,
  malformedUnicodeRejected: true,
  normalizationRequiresMatchingSource: true,
  preAbortedRequestRejectedAndNextCallWorked: true,
  failures,
  results,
}
console.log(JSON.stringify(report, null, 2))
process.exitCode = failures.length || results.some((result) => !result.sameMetadata || !result.sameReverts) ? 1 : 0
