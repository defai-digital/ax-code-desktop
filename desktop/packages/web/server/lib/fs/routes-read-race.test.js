import * as fs from "node:fs/promises"
import os from "node:os"
import path from "node:path"
import { afterEach, describe, expect, it, vi } from "vitest"
import { registerFsRoutes } from "./routes.js"
import { createMockResponse, createRouteRegistry } from "../../test-helpers/route-harness.js"

const temporaryDirectories = []
afterEach(async () => {
  await Promise.all(
    temporaryDirectories.splice(0).map((directory) => fs.rm(directory, { recursive: true, force: true })),
  )
})

async function createFixture() {
  const temporary = await fs.realpath(await fs.mkdtemp(path.join(os.tmpdir(), "ax-code-read-race-")))
  temporaryDirectories.push(temporary)
  const directory = path.join(temporary, "project")
  await fs.mkdir(directory)
  const filename = path.join(directory, "file.txt")
  await fs.writeFile(filename, "original bytes")
  return { temporary, directory, filename }
}

function registerRead(directory, fsPromises, route) {
  const { app, getRoute } = createRouteRegistry()
  registerFsRoutes(app, {
    os,
    path,
    fsPromises,
    spawn: vi.fn(),
    crypto: { randomUUID: () => "test" },
    normalizeDirectoryPath: (value) => value,
    resolveProjectDirectory: async () => ({ directory }),
    readSettingsFromDiskMigrated: async () => ({ approvedDirectories: [] }),
    buildAugmentedPath: () => "",
    resolveGitBinaryForSpawn: () => "git",
    openchamberUserConfigRoot: path.join(directory, ".config"),
  })
  return getRoute("GET", route)
}

describe.each(["/api/fs/read", "/api/fs/raw"])("%s descriptor consistency", (route) => {
  it("reads the same opened file that was inspected when its pathname is replaced", async () => {
    const { directory, filename } = await createFixture()
    let replaced = false
    const replacePath = async () => {
      if (replaced) return
      replaced = true
      await fs.rename(filename, filename + ".old")
      await fs.writeFile(filename, "replacement bytes")
    }
    const closed = vi.fn()
    const io = {
      ...fs,
      stat: async (...args) => {
        const stats = await fs.stat(...args)
        await replacePath()
        return stats
      },
      open: async (...args) => {
        const handle = await fs.open(...args)
        return {
          stat: async () => {
            const stats = await handle.stat()
            await replacePath()
            return stats
          },
          readFile: () => handle.readFile(),
          close: async () => {
            closed()
            await handle.close()
          },
        }
      },
    }
    const response = createMockResponse()
    await registerRead(directory, io, route)({ query: { path: filename } }, response)

    expect(response.statusCode).toBe(200)
    expect(Buffer.from(response.sent).toString()).toBe("original bytes")
    expect(closed).toHaveBeenCalledOnce()
  })

  it.skipIf(process.platform === "win32")("refuses a leaf symlink substituted after canonicalization", async () => {
    const { temporary, directory, filename } = await createFixture()
    const outside = path.join(temporary, "outside.txt")
    await fs.writeFile(outside, "outside sentinel")
    let replaced = false
    const io = {
      ...fs,
      realpath: async (target) => {
        const canonical = await fs.realpath(target)
        if (target === filename && !replaced) {
          replaced = true
          await fs.unlink(filename)
          await fs.symlink(outside, filename)
        }
        return canonical
      },
    }
    const response = createMockResponse()
    await registerRead(directory, io, route)({ query: { path: filename } }, response)

    expect(response.statusCode).toBe(403)
    expect(response.body).toEqual({ error: "Access to file denied" })
  })

  it("closes an opened file when its metadata check fails", async () => {
    const { directory, filename } = await createFixture()
    const close = vi.fn().mockResolvedValue(undefined)
    const readFile = vi.fn()
    const io = {
      ...fs,
      open: vi.fn().mockResolvedValue({
        stat: vi.fn().mockRejectedValue(Object.assign(new Error("denied"), { code: "EACCES" })),
        readFile,
        close,
      }),
    }
    const response = createMockResponse()
    await registerRead(directory, io, route)({ query: { path: filename } }, response)

    expect(response.statusCode).toBe(403)
    expect(readFile).not.toHaveBeenCalled()
    expect(close).toHaveBeenCalledOnce()
  })
})
