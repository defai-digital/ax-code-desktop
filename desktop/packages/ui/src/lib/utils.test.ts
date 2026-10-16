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
})
