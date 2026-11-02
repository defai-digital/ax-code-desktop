import { describe, expect, it } from "vitest"

import { createProjectDirectoryRuntime, readDirectoryHeader } from "./project-directory-runtime.js"

const requestWithHeader = (value) => ({
  get: (name) => (name === "x-ax-code-directory" ? value : undefined),
  query: {},
})

describe("readDirectoryHeader", () => {
  it("decodes a percent-encoded CJK directory", () => {
    expect(readDirectoryHeader(requestWithHeader(encodeURIComponent("/Users/a/项目")))).toBe("/Users/a/项目")
  })

  it("decodes a percent-encoded literal % in the directory", () => {
    expect(readDirectoryHeader(requestWithHeader(encodeURIComponent("/a/x%41y")))).toBe("/a/x%41y")
  })

  it("returns a raw ASCII directory unchanged", () => {
    expect(readDirectoryHeader(requestWithHeader("/work/alpha"))).toBe("/work/alpha")
  })

  it("falls back to the raw value when percent-encoding is malformed", () => {
    expect(readDirectoryHeader(requestWithHeader("/tmp/%E0%A4%A"))).toBe("/tmp/%E0%A4%A")
  })

  it("returns null when the header is absent", () => {
    expect(readDirectoryHeader({ get: () => undefined, query: {} })).toBe(null)
    expect(readDirectoryHeader({})).toBe(null)
  })
})

describe("resolveProjectDirectory header decoding", () => {
  it("resolves an encoded CJK header to the decoded directory", async () => {
    const runtime = createProjectDirectoryRuntime({
      fsPromises: {
        stat: async () => ({ isDirectory: () => true }),
        realpath: async (p) => p,
      },
      path: { resolve: (p) => p },
      normalizeDirectoryPath: (value) => value,
      readSettingsFromDiskMigrated: async () => ({}),
      getReadSettingsFromDiskMigrated: () => async () => ({}),
      sanitizeProjects: (input) => input,
    })

    const result = await runtime.resolveProjectDirectory(requestWithHeader(encodeURIComponent("/Users/a/项目")))

    expect(result).toEqual({ directory: "/Users/a/项目", error: null })
  })
})
