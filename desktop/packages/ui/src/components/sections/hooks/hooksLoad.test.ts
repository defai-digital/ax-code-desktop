import type { HookWorkspace } from "@defai-digital/ax-code-sdk/v2"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import { axCodeClient } from "@/lib/ax-code/client"

import { fetchHookWorkspace } from "./hooksLoad"

const workspace: HookWorkspace = {
  trusted: true,
  file: { path: "/repo/.ax-code/hooks.json", exists: true, valid: true },
  hooks: [],
  packs: [],
}

const hooksGet = vi.fn()

describe("fetchHookWorkspace", () => {
  beforeEach(() => {
    hooksGet.mockReset()
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  it("loads hooks for the trimmed directory", async () => {
    hooksGet.mockResolvedValue({ data: workspace })
    vi.spyOn(axCodeClient, "getScopedSdkClient").mockReturnValue({ hooks: { get: hooksGet } } as never)

    await expect(fetchHookWorkspace("  /repo/app  ")).resolves.toEqual(workspace)
    expect(axCodeClient.getScopedSdkClient).toHaveBeenCalledWith("/repo/app")
    expect(hooksGet).toHaveBeenCalledWith({ directory: "/repo/app" }, { throwOnError: true })
  })

  it("rejects a blank directory before calling the client", async () => {
    vi.spyOn(axCodeClient, "getScopedSdkClient").mockReturnValue({ hooks: { get: hooksGet } } as never)

    await expect(fetchHookWorkspace("   ")).rejects.toThrow(/directory is required/i)
    expect(hooksGet).not.toHaveBeenCalled()
  })

  it("rejects an empty payload", async () => {
    hooksGet.mockResolvedValue({ data: undefined })
    vi.spyOn(axCodeClient, "getScopedSdkClient").mockReturnValue({ hooks: { get: hooksGet } } as never)

    await expect(fetchHookWorkspace("/repo/app")).rejects.toThrow(/empty hooks response/i)
  })
})
