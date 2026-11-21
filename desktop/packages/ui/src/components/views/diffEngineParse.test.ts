import { createDiffEngine } from "@ax-code/diff-wasm/node"
import { diffAcceptRejectHunk, parseDiffFromFile, type FileDiffMetadata } from "@pierre/diffs"
import { afterAll, afterEach, describe, expect, test, vi } from "vitest"

import {
  ENGINE_TIMEOUT_MS,
  createDiffParser,
  isConsistentDiff,
  parseWithEngine,
  previewToPatch,
} from "./diffEngineParse"
import type { DiffParseRequest } from "./diffParseProtocol"

const engine = createDiffEngine()

afterAll(async () => {
  await engine.close()
})

afterEach(() => {
  vi.useRealTimers()
})

const request = (original: string, modified: string, name = "src/file.ts"): DiffParseRequest => ({
  id: 1,
  name,
  original,
  modified,
})

const pierre = ({ name, original, modified }: DiffParseRequest): FileDiffMetadata =>
  parseDiffFromFile({ name, contents: original }, { name, contents: modified })

const numbered = (count: number, newline = "\n") => Array.from({ length: count }, (_, index) => `line ${index}${newline}`)

function edited(newline: string): [string, string] {
  const before = numbered(120, newline)
  const after = [...before]
  after[3] = `first edit${newline}`
  after.splice(40, 2)
  after.splice(80, 0, `inserted 中文 😀${newline}`)
  after[after.length - 1] = `last edit${newline}`
  return [before.join(""), after.join("")]
}

const CASES: Array<[string, string, string]> = [
  ["scattered edits, LF", ...edited("\n")],
  ["scattered edits, CRLF", ...edited("\r\n")],
  ["missing final newline on one side", "a\nb\nc", "a\nB\nc\n"],
  ["mixed line endings", "a\r\nb\nc\rd\n", "a\nchanged\r\nc\rd"],
  ["new file", "", "one\ntwo\n"],
  ["deleted file", "one\ntwo\n", ""],
  ["insertion at the start", "b\nc\n", "a\nb\nc\n"],
  ["deletion at the end", "a\nb\nc\n", "a\nb\n"],
  ["identical sides", "same\n", "same\n"],
  ["lines that look like patch syntax", "--- a\n+++ b\n@@ -1 +1 @@\n", "--- b\n+++ b\n@@ -1 +1 @@\n\\ No newline at end of file"],
]

describe("canonical engine diff", () => {
  test.each(CASES)("matches the jsdiff parse exactly: %s", async (_name, original, modified) => {
    const outcome = await parseWithEngine(engine, request(original, modified))

    expect(outcome.approximate).toBe(false)
    expect(outcome.diff).toEqual(pierre(request(original, modified)))
  })

  test("keeps the file name the diff library derives, including an empty one", async () => {
    for (const name of ["", "dir/my file.ts", "中文.ts"]) {
      const outcome = await parseWithEngine(engine, request("one\ntwo\n", "one\n2\n", name))
      expect(outcome.diff).toEqual(pierre(request("one\ntwo\n", "one\n2\n", name)))
    }
  })

  test("returns a coarse diff for a large rewrite that still reverts to the original", async () => {
    const original = numbered(3000).join("")
    const modified = Array.from({ length: 3000 }, (_, index) => `rewritten ${index * 7}\n`).join("")

    const outcome = await parseWithEngine(engine, request(original, modified))

    expect(outcome.approximate).toBe(true)
    expect(isConsistentDiff(outcome.diff)).toBe(true)
    let reverted = outcome.diff
    for (let index = reverted.hunks.length - 1; index >= 0; index -= 1) {
      reverted = diffAcceptRejectHunk(reverted, index, "reject")
    }
    expect(reverted.additionLines.join("")).toBe(original)
  })

  test("writes an empty range as the line before it, as a unified header does", () => {
    const patch = previewToPatch("f.ts", {
      version: 1,
      additions: 1,
      deletions: 0,
      hunks: [{ oldStart: 1, oldLines: 0, newStart: 1, newLines: 1, lines: ["+a"] }],
    })

    expect(patch).toBe("--- f.ts\n+++ f.ts\n@@ -0,0 +1,1 @@\n+a\n")
  })
})

describe("diff consistency check", () => {
  test.each(CASES)("accepts the jsdiff parse: %s", (_name, original, modified) => {
    expect(isConsistentDiff(pierre(request(original, modified)))).toBe(true)
  })

  test("rejects hunks that hide a changed line", () => {
    const [original, modified] = edited("\n")
    const diff = pierre(request(original, modified))

    expect(isConsistentDiff({ ...diff, hunks: diff.hunks.slice(1) })).toBe(false)
    expect(isConsistentDiff({ ...diff, hunks: diff.hunks.slice(0, -1) })).toBe(false)
    expect(isConsistentDiff({ ...diff, hunks: [] })).toBe(false)
  })

  test("rejects hunks computed for other contents", () => {
    const [original, modified] = edited("\n")
    const diff = pierre(request(original, modified))
    const shifted = [...diff.additionLines]
    shifted.splice(1, 1)

    expect(isConsistentDiff({ ...diff, additionLines: shifted })).toBe(false)
    expect(isConsistentDiff({ ...diff, hunks: diff.hunks.map((hunk) => ({ ...hunk, collapsedBefore: hunk.collapsedBefore + 1 })) })).toBe(
      false,
    )
  })
})

describe("diff parser fallback", () => {
  const [original, modified] = edited("\n")
  const expected = pierre(request(original, modified))

  test("uses the engine when it loads", async () => {
    const diff = vi.fn(engine.diff)
    const parse = createDiffParser(async () => ({ diff }))

    expect(await parse(request(original, modified))).toEqual({ diff: expected, approximate: false })
    expect(diff).toHaveBeenCalledTimes(1)
  })

  test("falls back to jsdiff when the engine cannot load, and does not try to load it again", async () => {
    const load = vi.fn(async () => {
      throw new Error("engine files are missing")
    })
    const parse = createDiffParser(load)

    expect(await parse(request(original, modified))).toEqual({ diff: expected, approximate: false })
    expect(await parse(request(original, modified))).toEqual({ diff: expected, approximate: false })
    expect(load).toHaveBeenCalledTimes(1)
  })

  test("falls back for one input the engine refuses and keeps using the engine afterwards", async () => {
    const diff = vi.fn(engine.diff)
    diff.mockRejectedValueOnce(new RangeError("Diff byte limit exceeded"))
    const parse = createDiffParser(async () => ({ diff }))

    expect(await parse(request(original, modified))).toEqual({ diff: expected, approximate: false })
    expect(await parse(request(original, modified))).toEqual({ diff: expected, approximate: false })
    expect(diff).toHaveBeenCalledTimes(2)
  })

  test("never shows engine hunks that do not align the two files", async () => {
    const parse = createDiffParser(async () => ({
      diff: async () => ({ version: 1 as const, additions: 0, deletions: 0, hunks: [] }),
    }))

    expect(await parse(request(original, modified))).toEqual({ diff: expected, approximate: false })
  })

  test("stops using an engine that timed out", async () => {
    vi.useFakeTimers()
    const diff = vi.fn(async () => {
      vi.advanceTimersByTime(ENGINE_TIMEOUT_MS)
      throw new Error("Wasm operation timed out")
    })
    const parse = createDiffParser(async () => ({ diff }))

    expect(await parse(request(original, modified))).toEqual({ diff: expected, approximate: false })
    expect(await parse(request(original, modified))).toEqual({ diff: expected, approximate: false })
    expect(diff).toHaveBeenCalledTimes(1)
  })

  test("reports an input neither parser can read", async () => {
    const parse = createDiffParser(async () => {
      throw new Error("no engine")
    })

    await expect(parse({ id: 1, name: "f.ts", original: null, modified: null } as unknown as DiffParseRequest)).rejects.toThrow()
  })
})
