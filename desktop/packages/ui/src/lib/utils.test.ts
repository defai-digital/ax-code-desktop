import { describe, expect, test } from "vitest"

import { formatDirectoryName, formatPathForDisplay, truncatePathMiddle } from "./utils"

describe("formatPathForDisplay", () => {
  test("uses tilde for paths under the home directory", () => {
    expect(formatPathForDisplay("/Users/alice/project/src", "/Users/alice")).toBe("~/project/src")
  })

  test("normalizes Windows separators before applying home replacement", () => {
    expect(formatPathForDisplay("c:\\Users\\Alice\\Project\\", "C:/Users/Alice")).toBe("~/Project")
  })

  test("matches Windows home paths case-insensitively", () => {
    expect(formatPathForDisplay("C:/Users/Alice/Project/src", "c:/users/alice")).toBe("~/Project/src")
  })

  test("keeps POSIX home replacement case-sensitive", () => {
    expect(formatPathForDisplay("/Users/Alice/Project", "/users/alice")).toBe("/Users/Alice/Project")
  })

  test("keeps the filesystem root stable", () => {
    expect(formatPathForDisplay("/", "/Users/alice")).toBe("/")
  })
})

describe("formatDirectoryName", () => {
  test("returns the final normalized path segment", () => {
    expect(formatDirectoryName("c:\\Users\\Alice\\Project\\")).toBe("Project")
  })

  test("uses tilde when the path equals the home directory", () => {
    expect(formatDirectoryName("/Users/alice/", "/Users/alice")).toBe("~")
  })

  test("matches Windows home directory names case-insensitively", () => {
    expect(formatDirectoryName("C:/Users/Alice", "c:/users/alice")).toBe("~")
  })

  test("keeps POSIX home directory names case-sensitive", () => {
    expect(formatDirectoryName("/Users/Alice", "/users/alice")).toBe("Alice")
  })
})

describe("truncatePathMiddle", () => {
  test("honours the budget for a name that has no directory prefix", () => {
    // Callers pass a bare file name (`file.relativePath || file.name`); returning it
    // whole ignored the length the caller asked for and the label overflowed.
    const result = truncatePathMiddle("z".repeat(80), { maxLength: 20 })

    expect(result.length).toBeLessThanOrEqual(20)
    expect(result).toContain("…")
  })

  test("keeps a bare name's extension readable", () => {
    const result = truncatePathMiddle("a-very-long-file-name.ts", { maxLength: 16 })

    expect(result.length).toBeLessThanOrEqual(16)
    expect(result.endsWith(".ts")).toBe(true)
  })

  test("still abbreviates a directory prefix", () => {
    const result = truncatePathMiddle("/very/long/directory/tree/src/file.ts", { maxLength: 24 })

    expect(result).toBe("very/long…/file.ts")
    expect(result.length).toBeLessThanOrEqual(24)
  })

  test("keeps the budget when the file name alone leaves no room for a prefix", () => {
    // The prefix branch returned `…/${fileName}` as-is, so a file name longer than
    // maxLength - 2 overflowed the label the caller sized.
    const result = truncatePathMiddle("src/bbbbbbbbbbbbbbbb.ts", { maxLength: 16 })

    expect(result.length).toBeLessThanOrEqual(16)
    expect(result.startsWith("…/")).toBe(true)
    expect(result.endsWith(".ts")).toBe(true)
  })

  test("keeps the budget when a source longer than maxLength ends with a separator", () => {
    // A trailing separator splits off an empty final segment, and that branch returned
    // `source` untouched, so a directory-style label overran the budget by its slash.
    const result = truncatePathMiddle("d".repeat(61) + "/", { maxLength: 60 })

    expect(result.length).toBeLessThanOrEqual(60)
    expect(result.endsWith("/")).toBe(true)
    expect(result).toContain("…")
  })
})
