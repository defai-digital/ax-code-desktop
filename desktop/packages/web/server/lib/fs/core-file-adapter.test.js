import path from "node:path"
import { describe, expect, it, vi } from "vitest"

import {
  createCoreFileAdapter,
  mapCoreFileContentToPlainText,
  mapCoreFileNodesToDirectoryList,
  mapCoreFindFilesToSearchEntries,
  toRuntimeRelativePath,
} from "./core-file-adapter.js"

describe("core file adapter", () => {
  it("maps core payloads", () => {
    expect(mapCoreFileContentToPlainText({ type: "text", content: "hello" })).toBe("hello")
    expect(
      mapCoreFileNodesToDirectoryList("/repo", [{ name: "src", absolute: "/repo/src", type: "directory" }]),
    ).toEqual({
      directory: "/repo",
      entries: [{ name: "src", path: "/repo/src", isDirectory: true }],
    })
    expect(mapCoreFindFilesToSearchEntries("/repo", ["src/a.ts"], path.posix)[0].path).toBe("/repo/src/a.ts")
  })

  it("reads and searches through the core file contract", async () => {
    const fetchImpl = vi.fn(async (url) => {
      const href = String(url)
      if (href.includes("/file/content")) {
        return { ok: true, json: async () => ({ type: "text", content: "from-core" }) }
      }
      if (href.includes("/find/file")) {
        return { ok: true, json: async () => ["src/a.ts"] }
      }
      return { ok: true, json: async () => [{ name: "a.ts", absolute: "/repo/a.ts", type: "file" }] }
    })
    const adapter = createCoreFileAdapter({
      fetchImpl,
      getBaseUrl: () => "http://127.0.0.1:4090/",
      getHeaders: () => ({ Authorization: "Basic x" }),
    })
    await expect(adapter.read({ path: "/repo/a.ts", directory: "/repo" })).resolves.toBe("from-core")
    await expect(adapter.search({ query: "a.ts", directory: "/repo", limit: 10 })).resolves.toEqual(["src/a.ts"])
    expect(String(fetchImpl.mock.calls[0][0])).toContain("/file/content")
  })

  it("sends paths relative to the scoped directory, as the runtime resolves them", () => {
    expect(toRuntimeRelativePath("/repo", "/repo")).toBe(".")
    expect(toRuntimeRelativePath("/repo/", "/repo")).toBe(".")
    expect(toRuntimeRelativePath("/repo/src/a.ts", "/repo")).toBe("src/a.ts")
    expect(toRuntimeRelativePath("/elsewhere/a.ts", "/repo")).toBe("/elsewhere/a.ts")
    expect(toRuntimeRelativePath("src/a.ts", "/repo")).toBe("src/a.ts")
    expect(toRuntimeRelativePath("", "/repo")).toBe("")
    expect(toRuntimeRelativePath("/repo/src", "")).toBe("/repo/src")
  })

  it("lists and reads absolute desktop paths through runtime-relative queries", async () => {
    const fetchImpl = vi.fn(async () => ({ ok: true, json: async () => [] }))
    const adapter = createCoreFileAdapter({
      fetchImpl,
      getBaseUrl: () => "http://127.0.0.1:4090/",
      getHeaders: () => ({}),
    })
    await adapter.list({ path: "/Users/dev", directory: "/Users/dev" })
    await adapter.list({ path: "/Users/dev/code/app", directory: "/Users/dev" })
    await adapter.read({ path: "/Users/dev/code/app/README.md", directory: "/Users/dev/code/app" })
    const urls = fetchImpl.mock.calls.map((call) => new URL(String(call[0])))
    expect(urls[0].searchParams.get("path")).toBe(".")
    expect(urls[1].searchParams.get("path")).toBe("code/app")
    expect(urls[2].searchParams.get("path")).toBe("README.md")
    expect(fetchImpl.mock.calls[1][1].headers["x-ax-code-directory"]).toBe(encodeURIComponent("/Users/dev"))
  })
})
