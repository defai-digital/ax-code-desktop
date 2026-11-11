import * as fs from "node:fs/promises"
import os from "node:os"
import path from "node:path"
import { afterEach, describe, expect, it, vi } from "vitest"
import { createSettingsNormalizationRuntime } from "../ax-code/settings-normalization-runtime.js"
import { registerFsRoutes } from "./routes.js"
import { createMockResponse, createRouteRegistry } from "../../test-helpers/route-harness.js"

const directories = []
afterEach(async () => {
  await Promise.all(directories.splice(0).map((directory) => fs.rm(directory, { recursive: true, force: true })))
})

async function fixture() {
  const directory = await fs.realpath(await fs.mkdtemp(path.join(os.tmpdir(), "ax-code-path-spaces-")))
  directories.push(directory)
  const filename = path.join(directory, "notes.txt ")
  const sibling = filename.trimEnd()
  await fs.writeFile(filename, "requested file")
  await fs.writeFile(sibling, "other file")
  const { app, getRoute } = createRouteRegistry()
  const { normalizeDirectoryPath } = createSettingsNormalizationRuntime({ os, path, processLike: process })
  const list = vi.fn(async () => [])
  registerFsRoutes(app, {
    os,
    path,
    fsPromises: fs,
    spawn: vi.fn(),
    crypto: { randomUUID: () => "test" },
    normalizeDirectoryPath,
    resolveProjectDirectory: async () => ({ directory }),
    readSettingsFromDiskMigrated: async () => ({ approvedDirectories: [] }),
    buildAugmentedPath: () => "",
    resolveGitBinaryForSpawn: () => "git",
    openchamberUserConfigRoot: path.join(directory, ".config"),
    coreFileAdapter: { list },
  })
  const call = async (method, route, input) => {
    const response = createMockResponse()
    await getRoute(method, `/api/fs/${route}`)(method === "GET" ? { query: input } : { body: input }, response)
    return response
  }
  return { directory, filename, sibling, call, list }
}

// Windows normalizes trailing spaces itself; these distinct entries require a POSIX filesystem.
describe.skipIf(process.platform === "win32")("literal filesystem path whitespace", () => {
  it.each(["read", "raw", "stat"])("%s inspects the requested entry instead of its trimmed sibling", async (route) => {
    const { filename, call } = await fixture()
    const response = await call("GET", route, { path: filename })
    expect(response.statusCode).toBe(200)
    if (route === "stat") expect(response.body.size).toBe(Buffer.byteLength("requested file"))
    else expect(Buffer.from(response.sent).toString()).toBe("requested file")
  })

  it.each(["write", "delete", "rename"])("%s changes only the requested entry", async (route) => {
    const { filename, sibling, call } = await fixture()
    const renamed = filename + "renamed "
    const input = route === "rename"
      ? { oldPath: filename, newPath: renamed }
      : { path: filename, content: "updated contents" }
    const response = await call("POST", route, input)
    expect(response.statusCode).toBe(200)
    expect(await fs.readFile(sibling, "utf8")).toBe("other file")
    if (route === "write") expect(await fs.readFile(filename, "utf8")).toBe("updated contents")
    else {
      await expect(fs.stat(filename)).rejects.toMatchObject({ code: "ENOENT" })
      if (route === "rename") expect(await fs.readFile(renamed, "utf8")).toBe("requested file")
    }
  })

  it("lists the requested directory with its literal trailing space", async () => {
    const { directory, call, list } = await fixture()
    const folder = path.join(directory, "folder ")
    await fs.mkdir(folder)
    await fs.mkdir(folder.trimEnd())
    const response = await call("GET", "list", { path: folder })
    expect(response.statusCode).toBe(200)
    expect(list).toHaveBeenCalledWith({ path: folder, directory })
  })

  it.each(["read", "raw", "stat"])("%s still rejects an empty path", async (route) => {
    const { call } = await fixture()
    const response = await call("GET", route, { path: "  " })
    expect(response.statusCode).toBe(400)
    expect(response.body).toEqual({ error: "Path is required" })
  })
})
