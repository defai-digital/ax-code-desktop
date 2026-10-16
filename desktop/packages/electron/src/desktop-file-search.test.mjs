import path from "node:path"
import { createRequire } from "node:module"
import { describe, expect, test } from "vitest"

const require = createRequire(import.meta.url)
const {
  resolveSearchableNativeRoot,
  shouldIncludeNativeSearchEntry,
  shouldSearchNativeRoot,
  toNativeSearchRelativePath,
} = require("./desktop-file-search.js")

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

  test("the search handler resolves the root and applies the policy before it walks", async () => {
    const { readFile } = await import("node:fs/promises")
    const mainSource = await readFile(path.join(import.meta.dirname, "main.js"), "utf8")

    // Through its symlinks first: the policy reads the string it is given, and the walk follows the
    // link, so a check on the unresolved path let a link to a credential store through.
    expect(mainSource).toContain(
      "const searchableRoot = await resolveSearchableNativeRoot(resolvedRoot, { realpath: (value) => fsp.realpath(value) })",
    )
    expect(mainSource).toContain("if (!searchableRoot) return []")
  })
})

describe("resolveSearchableNativeRoot", () => {
  const realpathTo = (targets) => async (value) => {
    const resolved = targets[value]
    if (!resolved) throw Object.assign(new Error("ENOENT"), { code: "ENOENT" })
    return resolved
  }

  test("refuses a symlink that points into a credential store", async () => {
    // `path.resolve` does not follow symlinks, so the link was not the string that names the denied
    // directory: the walk followed it and listed the names desktop_read_file refuses.
    const root = await resolveSearchableNativeRoot("/tmp/alias", {
      home: "/Users/alice",
      realpath: realpathTo({ "/tmp/alias": "/Users/alice/.ssh" }),
    })

    expect(root).toBeNull()
  })

  test("accepts a project outside HOME and hands back its resolved path", async () => {
    const root = await resolveSearchableNativeRoot("/tmp/project-link", {
      home: "/Users/alice",
      realpath: realpathTo({ "/tmp/project-link": "/srv/project" }),
    })

    expect(root).toBe("/srv/project")
  })

  test("refuses a path that cannot be resolved", async () => {
    await expect(resolveSearchableNativeRoot("/tmp/gone", { realpath: realpathTo({}) })).resolves.toBeNull()
  })

  test("refuses without a way to resolve the path", async () => {
    await expect(resolveSearchableNativeRoot("/tmp/project")).resolves.toBeNull()
  })
})
