import { describe, expect, it } from "vitest"
import {
  normalizeGitBlobId,
  parseGitNameStatusZ,
  parseGitStageRecords,
  parseGitTreeRecords,
  parseIsBinaryFromNumstat,
} from "./output-parsers.js"

const SHA1 = "a".repeat(40)
const SHA256 = "b".repeat(64)

describe("Git output parsers", () => {
  it("normalizes SHA-1 and SHA-256 object IDs and rejects malformed values", () => {
    expect(normalizeGitBlobId(` ${SHA1.toUpperCase()}\n`)).toBe(SHA1)
    expect(normalizeGitBlobId(SHA256)).toBe(SHA256)
    for (const value of [null, 42, "", "HEAD", "a".repeat(41), "g".repeat(40)]) {
      expect(normalizeGitBlobId(value)).toBeNull()
    }
  })

  it("keeps literal paths in stage-zero index records and skips conflicts or malformed records", () => {
    const raw = [
      `100644 ${SHA1} 0\t leading\tname\n.txt`,
      `100755 ${SHA256} 0\t日本語.js`,
      `100644 ${SHA1} 2\tconflict.txt`,
      "100644 invalid 0\tbroken.txt",
      `100644 ${SHA1} 0\t`,
      "not a record",
      "",
    ].join("\0")
    expect([...parseGitStageRecords(raw)]).toEqual([
      [" leading\tname\n.txt", { id: SHA1, mode: "100644" }],
      ["日本語.js", { id: SHA256, mode: "100755" }],
    ])
  })

  it("reads tree object IDs without trimming filenames", () => {
    const raw = [
      `100644 blob ${SHA1}\t file\tname.txt `,
      "invalid",
      "100644 blob invalid\tbroken.txt",
      `100644 blob ${SHA256}\t日本語.txt`,
      "",
    ].join("\0")
    expect([...parseGitTreeRecords(raw)]).toEqual([
      [" file\tname.txt ", SHA1],
      ["日本語.txt", SHA256],
    ])
  })

  it("preserves rename and copy destinations with tabs, newlines and rename-like text", () => {
    const raw = [
      "M",
      " leading.txt",
      "R100",
      "old\tname.txt",
      "new\nname.txt",
      "C75",
      "source.txt",
      "literal => destination.txt",
      "D",
      "日本語.txt",
      "",
    ].join("\0")
    expect(parseGitNameStatusZ(raw)).toEqual([
      { status: "M", source: null, path: " leading.txt" },
      { status: "R", source: "old\tname.txt", path: "new\nname.txt" },
      { status: "C", source: "source.txt", path: "literal => destination.txt" },
      { status: "D", source: null, path: "日本語.txt" },
    ])
  })

  it("ignores incomplete name-status records and empty command output", () => {
    expect(parseGitNameStatusZ("R100\0source-only\0")).toEqual([])
    expect(parseGitNameStatusZ("M\0")).toEqual([])
    expect(parseGitNameStatusZ(null)).toEqual([])
    expect(parseGitStageRecords("").size).toBe(0)
    expect(parseGitTreeRecords("").size).toBe(0)
  })

  it.each([
    ["-\t-\timage.png\n", true],
    ["1\t-\timage.png\n", true],
    ["12\t3\tfile.txt\n", false],
    ["", false],
  ])("detects binary numstat output %j", (raw, binary) => {
    expect(parseIsBinaryFromNumstat(raw)).toBe(binary)
  })
})
