import path from "node:path"
import { createRequire } from "node:module"
import { describe, expect, test } from "vitest"

const require = createRequire(import.meta.url)
const { shouldIncludeNativeSearchEntry, shouldSearchNativeRoot, toNativeSearchRelativePath } = require("./desktop-file-search.js")

const mockEntry = (name, type) => ({
  name,
  isDirectory: () => type === "directory",
  isFile: () => type === "file",
})

describe("desktop file search helpers", () => {
  test("returns forward-slash relative paths with Windows path semantics", () => {
    expect(
      toNativeSearchRelativePath("C:\\Users\\Alice\\project", "C:\\Users\\Alice\\project\\src\\app.ts", path.win32),
    ).toBe("src/app.ts")
  })

  test("keeps POSIX relative paths unchanged", () => {
    expect(toNativeSearchRelativePath("/Users/alice/project", "/Users/alice/project/src/app.ts", path.posix)).toBe(
      "src/app.ts",
    )
  })

  test("filters native search entries by requested result type", () => {
    expect(shouldIncludeNativeSearchEntry(mockEntry("app.ts", "file"), "file", "app")).toBe(true)
    expect(shouldIncludeNativeSearchEntry(mockEntry("src", "directory"), "file", "src")).toBe(false)
    expect(shouldIncludeNativeSearchEntry(mockEntry("src", "directory"), "directory", "src")).toBe(true)
    expect(shouldIncludeNativeSearchEntry(mockEntry("app.ts", "file"), "directory", "app")).toBe(false)
  })

  test("refuses a root the read path denies, so it cannot enumerate a credential store", () => {
    // The renderer names the root, so a search rooted at HOME would have listed the names
    // underneath .ssh, .aws and the app's own config that desktop_read_file refuses.
    expect(shouldSearchNativeRoot("/Users/alice/.ssh", { home: "/Users/alice" })).toBe(false)
    expect(shouldSearchNativeRoot("/Users/alice/.aws", { home: "/Users/alice" })).toBe(false)
    expect(shouldSearchNativeRoot("/Users/alice/.config/ax-code", { home: "/Users/alice" })).toBe(false)
    expect(shouldSearchNativeRoot("/Users/alice/.local/share/ax-code", { home: "/Users/alice" })).toBe(false)
    expect(shouldSearchNativeRoot("/Users/alice/project/keys/client.pem", { home: "/Users/alice" })).toBe(false)
  })

  test("still searches a project directory, including one outside HOME", () => {
    expect(shouldSearchNativeRoot("/Users/alice/project", { home: "/Users/alice" })).toBe(true)
    expect(shouldSearchNativeRoot("/Volumes/work/project", { home: "/Users/alice" })).toBe(true)
    expect(shouldSearchNativeRoot("/Users/alice/project/.github", { home: "/Users/alice" })).toBe(true)
    expect(shouldSearchNativeRoot("")).toBe(false)
  })

  test("the search handler applies the root check before it walks", async () => {
    const { readFile } = await import("node:fs/promises")
    const mainSource = await readFile(path.join(import.meta.dirname, "main.js"), "utf8")

    expect(mainSource).toContain("if (!shouldSearchNativeRoot(resolvedRoot)) return []")
  })
})
