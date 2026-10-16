import { describe, expect, it, vi } from "vitest"
import { disposeRuntimeInstance } from "./dispose-runtime-instance.js"

const buildAxCodeUrl = (path, prefix = "") => `http://127.0.0.1:4096${prefix}${path}`

describe("disposeRuntimeInstance", () => {
  it("posts the worktree directory to the runtime's dispose endpoint", async () => {
    // The runtime keeps one instance per directory, and removing the directory without telling it
    // left those instances rooted at paths that no longer exist.
    const fetchImpl = vi.fn(async () => ({ ok: true }))

    await expect(
      disposeRuntimeInstance({
        directory: "/repo/.worktrees/feat",
        buildAxCodeUrl,
        getAxCodeAuthHeaders: () => ({ authorization: "Bearer t" }),
        fetchImpl,
      }),
    ).resolves.toBe(true)

    const [url, init] = fetchImpl.mock.calls[0]
    expect(String(url)).toBe("http://127.0.0.1:4096/instance/dispose?directory=%2Frepo%2F.worktrees%2Ffeat")
    expect(init.method).toBe("POST")
    expect(init.headers).toEqual({ authorization: "Bearer t" })
  })

  it("reports a refused dispose instead of throwing it at the caller", async () => {
    const fetchImpl = vi.fn(async () => ({ ok: false, status: 404 }))

    await expect(
      disposeRuntimeInstance({ directory: "/repo/.worktrees/feat", buildAxCodeUrl, fetchImpl }),
    ).resolves.toBe(false)
  })

  it("does nothing without a directory", async () => {
    const fetchImpl = vi.fn()

    await expect(disposeRuntimeInstance({ directory: "  ", buildAxCodeUrl, fetchImpl })).resolves.toBe(false)
    expect(fetchImpl).not.toHaveBeenCalled()
  })
})
