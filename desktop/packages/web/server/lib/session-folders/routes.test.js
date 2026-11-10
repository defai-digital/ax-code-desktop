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
    expect(response.body).toEqual({ version: 1, foldersMap: {}, collapsedFolderIds: [], updatedAt: 0, revision: 0 })
  })

  it("uses unique temp files for concurrent saves", async () => {
    const { app, getRoute } = createRouteRegistry()
    const tempPaths = []
    const fsPromises = {
      readFile: vi.fn(async () => {
        throw Object.assign(new Error("Not found"), { code: "ENOENT" })
      }),
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
      readFile: vi.fn(async () => {
        throw Object.assign(new Error("Not found"), { code: "ENOENT" })
      }),
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
      fsPromises,
    }
  }

  it.each(["EIO", "EACCES"])("preserves the snapshot after a %s read failure and allows the next save", async (code) => {
    const folder = { id: "other-window", name: "Other", sessionIds: [], createdAt: 1, parentId: null }
    const { handler, readWritten, fsPromises } = createMergeHarness({
      version: 1,
      updatedAt: 200,
      foldersMap: { "/p": [folder] },
      collapsedFolderIds: [folder.id],
    })
    fsPromises.readFile.mockRejectedValueOnce(Object.assign(new Error("Snapshot read failed"), { code }))
    const request = { body: { version: 1, updatedAt: 100, foldersMap: {}, collapsedFolderIds: [] } }
    const failed = createMockResponse()
    await handler(request, failed)

    expect(failed.statusCode).toBe(500)
    expect(failed.body.error).toBe("Snapshot read failed")
    expect(readWritten()).toBeNull()
    expect(fsPromises.mkdir).not.toHaveBeenCalled()
    expect(fsPromises.writeFile).not.toHaveBeenCalled()
    expect(fsPromises.rename).not.toHaveBeenCalled()

    const retried = createMockResponse()
    await handler(request, retried)
    expect(retried.statusCode).toBe(200)
    expect(readWritten().foldersMap["/p"]).toEqual([folder])
    expect(readWritten().collapsedFolderIds).toEqual([folder.id])
  })

  it.each(["", "not json {"])("still recovers a malformed snapshot %j on an explicit save", async (raw) => {
    const { handler, readWritten, fsPromises } = createMergeHarness(null)
    fsPromises.readFile.mockResolvedValueOnce(raw)
    const response = createMockResponse()
    await handler({ body: { version: 1, updatedAt: 100, foldersMap: {}, collapsedFolderIds: [] } }, response)
    expect(response.statusCode).toBe(200)
    expect(readWritten()).toEqual({ version: 1, updatedAt: 100, foldersMap: {}, collapsedFolderIds: [], revision: 1 })
  })

  it("creates the first snapshot when the file is missing", async () => {
    const { handler, readWritten, fsPromises } = createMergeHarness(null)
    fsPromises.readFile.mockRejectedValueOnce(Object.assign(new Error("Not found"), { code: "ENOENT" }))
    const response = createMockResponse()
    await handler({ body: { version: 1, updatedAt: 100, foldersMap: {}, collapsedFolderIds: [] } }, response)
    expect(response.statusCode).toBe(200)
    expect(readWritten().updatedAt).toBe(100)
  })

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

  it("keeps persisting deletions after a snapshot stamped in the future", async () => {
    // A client clock ahead of real time left its stamp in the file, and every later snapshot compared as lagging:
    // the deleted folder stayed on disk until real time passed the stamp.
    const future = Date.now() + 365 * 24 * 60 * 60 * 1000
    const folder = (id) => ({ id, name: id, sessionIds: [], createdAt: 1, parentId: null })
    const { handler, readWritten } = createMergeHarness({
      version: 1,
      updatedAt: future,
      foldersMap: { "/p": [folder("keep"), folder("gone")] },
      collapsedFolderIds: [],
    })

    const response = createMockResponse()
    await handler(
      { body: { version: 1, updatedAt: Date.now(), foldersMap: { "/p": [folder("keep")] }, collapsedFolderIds: [] } },
      response,
    )
    expect(response.statusCode).toBe(200)
    expect(readWritten().foldersMap["/p"].map((entry) => entry.id)).toEqual(["keep"])

    await handler({ body: { version: 1, updatedAt: future, foldersMap: { "/p": [folder("keep")] } } }, createMockResponse())
    expect(readWritten().updatedAt).toBeLessThan(future)
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

  it("does not re-collapse a folder the newer file expanded", async () => {
    // The lagging writer's collapsed ids were unioned with the file's, so a stale debounce that still had the
    // folder collapsed undid an expand that had already been saved.
    const folder = { id: "folder-1", name: "One", sessionIds: [], createdAt: 1, parentId: null }
    const fresh = { id: "lagging-new", name: "New", sessionIds: [], createdAt: 2, parentId: null }
    const { handler, readWritten } = createMergeHarness({
      version: 1,
      updatedAt: 200,
      foldersMap: { "/p": [folder] },
      collapsedFolderIds: [],
    })

    const response = createMockResponse()
    await handler(
      {
        body: {
          version: 1,
          updatedAt: 100,
          foldersMap: { "/p": [folder, fresh] },
          collapsedFolderIds: [folder.id, fresh.id],
        },
      },
      response,
    )

    expect(response.statusCode).toBe(200)
    // The folder only the lagging writer knows keeps its own collapsed state.
    expect(readWritten().collapsedFolderIds).toEqual([fresh.id])
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
  describe("revisions", () => {
    const folder = (id, name = id) => ({ id, name, sessionIds: [], createdAt: 1, parentId: null })

    it("reports the stored revision, and 0 for a file written before revisions existed", async () => {
      const { app, getRoute } = createRouteRegistry()
      const stored = { version: 1, updatedAt: 1, foldersMap: {}, collapsedFolderIds: [] }
      const fsPromises = { readFile: vi.fn(async () => JSON.stringify(stored)) }
      registerSessionFoldersRoutes(app, { fsPromises, path, openchamberDataDir: "/tmp/openchamber-test" })
      const handler = getRoute("GET", "/api/session-folders")

      const legacy = createMockResponse()
      await handler({}, legacy)
      expect(legacy.body.revision).toBe(0)

      stored.revision = 7
      const current = createMockResponse()
      await handler({}, current)
      expect(current.body.revision).toBe(7)
    })

    it("accepts a snapshot based on the current revision as authoritative and advances the revision", async () => {
      const { handler, readWritten } = createMergeHarness({
        version: 1,
        revision: 4,
        updatedAt: 500,
        foldersMap: { "/p": [folder("keep"), folder("gone")] },
        collapsedFolderIds: [],
      })

      const response = createMockResponse()
      // Older timestamp than the file: by revision it is still the newest write, so its deletion persists.
      await handler(
        { body: { version: 1, baseRevision: 4, updatedAt: 100, foldersMap: { "/p": [folder("keep")] }, collapsedFolderIds: [] } },
        response,
      )

      expect(response.statusCode).toBe(200)
      expect(response.body).toEqual({ success: true, revision: 5 })
      expect(readWritten().revision).toBe(5)
      expect(readWritten().foldersMap["/p"].map((entry) => entry.id)).toEqual(["keep"])
      expect(readWritten()).not.toHaveProperty("baseRevision")
    })

    it("refuses a snapshot based on an older revision and returns the current file", async () => {
      // A lagging writer used to overwrite every folder id it carried, so a stale window reverted a rename
      // another window had already saved.
      const stored = {
        version: 1,
        revision: 6,
        updatedAt: 200,
        foldersMap: { "/p": [folder("shared", "Renamed in window A")] },
        collapsedFolderIds: [],
      }
      const { handler, readWritten, fsPromises } = createMergeHarness(stored)

      const response = createMockResponse()
      await handler(
        {
          body: { version: 1, baseRevision: 5, updatedAt: 300, foldersMap: { "/p": [folder("shared", "Old")] }, collapsedFolderIds: [] },
        },
        response,
      )

      expect(response.statusCode).toBe(409)
      expect(response.body.current).toEqual(stored)
      expect(readWritten()).toBeNull()
      expect(fsPromises.writeFile).not.toHaveBeenCalled()
    })

    it("still merges a write without baseRevision and advances the revision", async () => {
      const { handler, readWritten } = createMergeHarness({
        version: 1,
        revision: 2,
        updatedAt: 200,
        foldersMap: { "/p": [folder("other-window")] },
        collapsedFolderIds: [],
      })

      const response = createMockResponse()
      await handler({ body: { version: 1, updatedAt: 100, foldersMap: { "/p": [folder("mine")] } } }, response)

      expect(response.body).toEqual({ success: true, revision: 3 })
      expect(readWritten().foldersMap["/p"].map((entry) => entry.id).sort()).toEqual(["mine", "other-window"])
    })

    it.each([-1, 1.5, "3"])("rejects baseRevision %j", async (baseRevision) => {
      const { handler, fsPromises } = createMergeHarness(null)
      const response = createMockResponse()
      await handler({ body: { version: 1, baseRevision, foldersMap: {} } }, response)
      expect(response.statusCode).toBe(400)
      expect(fsPromises.writeFile).not.toHaveBeenCalled()
    })
  })
})
