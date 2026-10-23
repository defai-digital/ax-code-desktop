import React, { act } from "react"
import { createRoot } from "react-dom/client"
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest"

vi.doMock("@/lib/ax-code/client", () => ({
  axCodeClient: {
    getDirectory: vi.fn(() => "/workspace/fallback"),
    getFilesystemHome: vi.fn(async () => "/Users/Alice"),
    getSystemInfo: vi.fn(async () => ({ homeDir: "/Users/Alice" })),
    setDirectory: vi.fn(),
  },
}))

vi.doMock("@/lib/persistence", () => ({
  updateDesktopSettings: vi.fn(),
}))

vi.doMock("@/stores/utils/streamDebug", () => ({
  streamDebugEnabled: vi.fn(() => false),
}))

const { useActiveConfigDirectory } = await import("./useActiveConfigDirectory")
const { useProjectsStore } = await import("@/stores/useProjectsStore")

describe("useActiveConfigDirectory", () => {
  beforeEach(() => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => new Response(JSON.stringify({ skipped: true }), { status: 200 })),
    )
    useProjectsStore.setState({ projects: [], activeProjectId: null })
  })

  afterEach(() => {
    vi.unstubAllGlobals()
  })

  test("follows the active project after it changes instead of freezing the first value", async () => {
    globalThis.IS_REACT_ACT_ENVIRONMENT = true
    const first = useProjectsStore.getState().addProject("/Users/Alice/first")
    const second = useProjectsStore.getState().addProject("/Users/Alice/second")
    useProjectsStore.getState().setActiveProject(first!.id)

    const container = document.createElement("div")
    document.body.append(container)
    const root = createRoot(container)
    let observed: string | null = null
    function Probe() {
      observed = useActiveConfigDirectory()
      return null
    }

    await act(async () => {
      root.render(<Probe />)
    })
    expect(observed).toBe("/Users/Alice/first")

    await act(async () => {
      useProjectsStore.getState().setActiveProject(second!.id)
    })
    expect(observed).toBe("/Users/Alice/second")

    await act(async () => {
      root.unmount()
    })
    container.remove()
  })
})
