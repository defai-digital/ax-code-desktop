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

  const createMergeHarness = (baseSnapshot) => {
    const { app, getRoute } = createRouteRegistry()
    let written = null
    const fsPromises = {
      mkdir: vi.fn(async () => {}),
      readFile: vi.fn(async () => JSON.stringify(baseSnapshot)),
      writeFile: vi.fn(async (_tempPath, serialized) => {
        written = JSON.parse(serialized)
      }),
      rename: vi.fn(async () => {}),
    }
    registerSessionFoldersRoutes(app, { fsPromises, path, openchamberDataDir: "/tmp/openchamber-test" })
    return {
      handler: getRoute("POST", "/api/session-folders"),
      readWritten: () => written,
    }
  }

  it("persists a deletion from a newer snapshot", async () => {
    // The disk still lists the deleted folder; the incoming full snapshot (the
    // single window's own view, newer than the file) no longer carries it. The
    // per-id union kept it on disk forever and the next boot resurrected it.
    const { handler, readWritten } = createMergeHarness({
      version: 1,
      updatedAt: 100,
      foldersMap: { "/p": [{ id: "keep", name: "Keep", sessionIds: [], createdAt: 1, parentId: null }] },
      collapsedFolderIds: ["gone"],
    })

    const response = createMockResponse()
    await handler(
      {
        body: {
          version: 1,
          updatedAt: 200,
          foldersMap: { "/p": [{ id: "keep", name: "Keep", sessionIds: [], createdAt: 1, parentId: null }] },
          collapsedFolderIds: [],
        },
      },
      response,
    )

    expect(response.statusCode).toBe(200)
    const written = readWritten()
    expect(written.foldersMap["/p"].map((folder) => folder.id)).toEqual(["keep"])
    // The un-collapsed folder stays un-collapsed; ids of gone folders do not linger.
    expect(written.collapsedFolderIds).toEqual([])
  })

  it("keeps folders a lagging writer never saw", async () => {
    // An older in-flight write (another window's debounced save racing a newer
    // one) must not erase a folder that landed on disk after it was taken.
    const { handler, readWritten } = createMergeHarness({
      version: 1,
      updatedAt: 200,
      foldersMap: {
        "/p": [
          { id: "shared", name: "Shared", sessionIds: [], createdAt: 1, parentId: null },
          { id: "other-window", name: "Other", sessionIds: [], createdAt: 150, parentId: null },
        ],
      },
      collapsedFolderIds: ["other-window"],
    })

    const response = createMockResponse()
    await handler(
      {
        body: {
          version: 1,
          updatedAt: 100,
          foldersMap: { "/p": [{ id: "shared", name: "Shared renamed", sessionIds: [], createdAt: 1, parentId: null }] },
          collapsedFolderIds: [],
        },
      },
      response,
    )

    expect(response.statusCode).toBe(200)
    const written = readWritten()
    const byId = new Map(written.foldersMap["/p"].map((folder) => [folder.id, folder]))
    expect([...byId.keys()].sort()).toEqual(["other-window", "shared"])
    expect(byId.get("shared").name).toBe("Shared renamed")
    expect(written.collapsedFolderIds).toEqual(["other-window"])
  })

  it("drops collapsed ids of folders that no longer exist", async () => {
    const { handler, readWritten } = createMergeHarness({
      version: 1,
      updatedAt: 100,
      foldersMap: { "/p": [{ id: "keep", name: "Keep", sessionIds: [], createdAt: 1, parentId: null }] },
      collapsedFolderIds: ["keep", "gone"],
    })

    const response = createMockResponse()
    await handler(
      {
        body: {
          version: 1,
          updatedAt: 200,
          foldersMap: { "/p": [{ id: "keep", name: "Keep", sessionIds: [], createdAt: 1, parentId: null }] },
          collapsedFolderIds: ["keep", "gone"],
        },
      },
      response,
    )

    expect(readWritten().collapsedFolderIds).toEqual(["keep"])
  })
})
