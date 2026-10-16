import path from "node:path"
import { createRequire } from "node:module"
import { describe, expect, test } from "vitest"

const require = createRequire(import.meta.url)
const {
  collectNativeSearchResults,
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

describe("collectNativeSearchResults", () => {
  // A small in-memory directory tree: `readdir` answers from it, so the walk can be driven without a
  // real home directory.
  const createFs = (tree) => ({
    readdir: async (dir) => {
      const entries = tree[dir]
      if (!entries) throw Object.assign(new Error("ENOENT"), { code: "ENOENT" })
      return entries.map((entry) => ({
        name: entry.name,
        isDirectory: () => entry.type === "directory",
        isFile: () => entry.type === "file",
      }))
    },
  })

  const policyOptions = { home: "/Users/alice", tmp: "/tmp", pathTools: path.posix }

  test("does not list store contents under a root the policy allows", async () => {
    // `~/.config` is an allowed root (only its longer denied prefixes are refused), and the walk used
    // to descend into every child: searching it listed gh/hosts.yml and the runtime's auth files —
    // names of exactly the paths `desktop_read_file` refuses.
    const root = "/Users/alice/.config"
    const results = await collectNativeSearchResults({
      root,
      query: "hosts",
      options: policyOptions,
      fs: createFs({
        [root]: [
          { name: "gh", type: "directory" },
          { name: "nvim", type: "directory" },
        ],
        [`${root}/gh`]: [{ name: "hosts.yml", type: "file" }],
        [`${root}/nvim`]: [{ name: "hosts.lua", type: "file" }],
      }),
    })

    expect(results.map((entry) => entry.path)).toEqual([`${root}/nvim/hosts.lua`])
  })

  test("resolves a symlinked root before applying the policy to a directory", async () => {
    // The walk keeps the caller's paths so results stay where the renderer expects them, and the HOME-relative
    // deny rules compare strings — so a root like `/tmp/alias` pointing at `~/.config` walked into `ax-code` and
    // listed the runtime's auth files, names of exactly the paths `desktop_read_file` refuses.
    const root = "/tmp/alias"
    const results = await collectNativeSearchResults({
      root,
      query: "auth",
      options: policyOptions,
      fs: {
        ...createFs({
          [root]: [
            { name: "ax-code", type: "directory" },
            { name: "project", type: "directory" },
          ],
          [`${root}/ax-code`]: [{ name: "auth.json", type: "file" }],
          [`${root}/project`]: [{ name: "auth-notes.md", type: "file" }],
        }),
        realpath: async (candidate) =>
          candidate === `${root}/ax-code` ? "/Users/alice/.config/ax-code" : candidate,
      },
    })

    // The denied store is skipped, the ordinary sibling still answers.
    expect(results.map((entry) => entry.relativePath)).toEqual(["project/auth-notes.md"])
  })

  test("walks past a directory the policy denies but keeps ordinary siblings", async () => {
    const root = "/Users/alice/project"
    const results = await collectNativeSearchResults({
      root,
      query: "notes",
      options: policyOptions,
      fs: createFs({
        [root]: [
          { name: "src", type: "directory" },
          { name: "notes.md", type: "file" },
        ],
        [`${root}/src`]: [{ name: "notes.txt", type: "file" }],
      }),
    })

    expect(results.map((entry) => entry.relativePath).sort()).toEqual(["notes.md", "src/notes.txt"])
  })
})
