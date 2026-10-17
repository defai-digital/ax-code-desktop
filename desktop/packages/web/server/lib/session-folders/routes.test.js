import { describe, expect, it, vi } from "vitest"
import path from "path"

import { registerSessionFoldersRoutes } from "./routes.js"
import { createMockResponse, createRouteRegistry } from "../../test-helpers/route-harness.js"

describe("session folders routes", () => {
  it("answers with an error instead of an empty snapshot when the stored file is corrupted", async () => {
    // The client's disk hydration treats an empty snapshot as authoritative, so a
    // corrupt file used to read as "no folders" and a follow-up write would replace
    // the user's organization with nothing.
    const { app, getRoute } = createRouteRegistry()
    const fsPromises = {
      readFile: vi.fn(async () => "not json {"),
    }

    registerSessionFoldersRoutes(app, {
      fsPromises,
      path,
      openchamberDataDir: "/tmp/openchamber-test",
    })

    const handler = getRoute("GET", "/api/session-folders")
    const response = createMockResponse()
    await handler({}, response)

    expect(response.statusCode).toBe(500)
    expect(response.body.error).toMatch(/corrupt/i)
  })

  it("treats a zero-byte stored file as corrupt rather than as no folders", async () => {
    // `!raw` conflated "the file is missing" with "the file is there and empty": a file truncated by a
    // non-atomic writer answered 200 with the empty snapshot, which the client treats as authoritative and
    // writes back — the same data-loss cascade the branch above refuses for unparseable JSON.
    const { app, getRoute } = createRouteRegistry()
    const fsPromises = {
      readFile: vi.fn(async () => ""),
    }

    registerSessionFoldersRoutes(app, {
      fsPromises,
      path,
      openchamberDataDir: "/tmp/openchamber-test",
    })

    const handler = getRoute("GET", "/api/session-folders")
    const response = createMockResponse()
    await handler({}, response)

    expect(response.statusCode).toBe(500)
    expect(response.body.error).toMatch(/corrupt/i)
  })

  it("still answers the empty snapshot when the file is not there yet", async () => {
    const { app, getRoute } = createRouteRegistry()
    const fsPromises = {
      readFile: vi.fn(async () => {
        const error = new Error("ENOENT: no such file or directory")
        error.code = "ENOENT"
        throw error
      }),
    }

    registerSessionFoldersRoutes(app, {
      fsPromises,
      path,
      openchamberDataDir: "/tmp/openchamber-test",
    })

    const handler = getRoute("GET", "/api/session-folders")
    const response = createMockResponse()
    await handler({}, response)

    expect(response.statusCode).toBe(200)
    expect(response.body).toEqual({ version: 1, foldersMap: {}, collapsedFolderIds: [], updatedAt: 0 })
  })

  it("uses unique temp files for concurrent saves", async () => {
    const { app, getRoute } = createRouteRegistry()
    const tempPaths = []
    const fsPromises = {
      mkdir: vi.fn(async () => {}),
      writeFile: vi.fn(async (tempPath) => {
        tempPaths.push(tempPath)
        await new Promise((resolve) => setTimeout(resolve, 0))
      }),
      rename: vi.fn(async () => {}),
    }

    registerSessionFoldersRoutes(app, {
      fsPromises,
      path,
      openchamberDataDir: "/tmp/openchamber-test",
    })

    const handler = getRoute("POST", "/api/session-folders")

    await Promise.all([
      handler({ body: { version: 1, updatedAt: 1 } }, createMockResponse()),
      handler({ body: { version: 1, updatedAt: 2 } }, createMockResponse()),
    ])

    expect(tempPaths).toHaveLength(2)
    expect(new Set(tempPaths).size).toBe(2)
    expect(tempPaths.every((tempPath) => tempPath.includes("sessions-directories.json.tmp-"))).toBe(true)
  })

  it("removes the temp file when rename fails", async () => {
    const { app, getRoute } = createRouteRegistry()
    const fsPromises = {
      mkdir: vi.fn(async () => {}),
      writeFile: vi.fn(async () => {}),
      rename: vi.fn(async () => {
        throw new Error("rename failed")
      }),
      unlink: vi.fn(async () => {}),
    }

    registerSessionFoldersRoutes(app, {
      fsPromises,
      path,
      openchamberDataDir: "/tmp/openchamber-test",
    })

    const handler = getRoute("POST", "/api/session-folders")
    const response = createMockResponse()

    await handler({ body: { version: 1, updatedAt: 1 } }, response)

    expect(response.statusCode).toBe(500)
    expect(fsPromises.unlink).toHaveBeenCalledWith(expect.stringContaining("sessions-directories.json.tmp-"))
  })
})
