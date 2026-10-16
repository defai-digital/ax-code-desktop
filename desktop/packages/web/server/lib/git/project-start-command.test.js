import { describe, expect, it, vi } from "vitest"
import { readRuntimeProjectStartCommand } from "./project-start-command.js"

const buildAxCodeUrl = (path, prefix = "") => `http://127.0.0.1:4096${prefix}${path}`

const projectsResponse = (projects) => ({ ok: true, status: 200, json: async () => projects })

describe("readRuntimeProjectStartCommand", () => {
  it("reads the start command of the requested project", async () => {
    // The command lives on the runtime's project record; the storage/project JSON this used to
    // read is what the runtime migrated from and no longer writes.
    const fetchImpl = vi.fn(async () =>
      projectsResponse([
        { id: "other", commands: { start: "echo other" } },
        { id: "proj-1", commands: { start: " pnpm install " } },
      ]),
    )

    await expect(
      readRuntimeProjectStartCommand({
        projectID: "proj-1",
        buildAxCodeUrl,
        getAxCodeAuthHeaders: () => ({ authorization: "Basic t" }),
        fetchImpl,
      }),
    ).resolves.toBe("pnpm install")

    const [url, init] = fetchImpl.mock.calls[0]
    expect(String(url)).toBe("http://127.0.0.1:4096/project")
    expect(init.headers).toEqual({ authorization: "Basic t" })
  })

  it("runs nothing for a project the runtime does not list", async () => {
    const fetchImpl = vi.fn(async () => projectsResponse([{ id: "other", commands: { start: "echo other" } }]))

    await expect(readRuntimeProjectStartCommand({ projectID: "proj-1", buildAxCodeUrl, fetchImpl })).resolves.toBe("")
  })

  it("runs nothing when the runtime refuses the read", async () => {
    const fetchImpl = vi.fn(async () => ({ ok: false, status: 401, json: async () => ({}) }))

    await expect(readRuntimeProjectStartCommand({ projectID: "proj-1", buildAxCodeUrl, fetchImpl })).resolves.toBe("")
  })

  it("runs nothing when the read fails", async () => {
    const fetchImpl = vi.fn(async () => {
      throw new Error("The operation was aborted due to timeout")
    })

    await expect(readRuntimeProjectStartCommand({ projectID: "proj-1", buildAxCodeUrl, fetchImpl })).resolves.toBe("")
  })

  it("does not ask the runtime without a project id", async () => {
    const fetchImpl = vi.fn()

    await expect(readRuntimeProjectStartCommand({ projectID: "  ", buildAxCodeUrl, fetchImpl })).resolves.toBe("")
    expect(fetchImpl).not.toHaveBeenCalled()
  })
})
