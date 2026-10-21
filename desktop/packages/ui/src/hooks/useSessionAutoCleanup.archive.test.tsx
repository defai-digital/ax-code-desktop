import React, { act } from "react"
import { createRoot } from "react-dom/client"
import { expect, test, vi } from "vitest"
import type { Session } from "@defai-digital/ax-code-sdk/v2"

test.each([true, false])("retention archive supports the global API: %s", async (supportsGlobalArchive) => {
  vi.resetModules()
  const now = Date.now()
  const sessions = [
    ...Array.from({ length: 5 }, (_, i) => ({ id: `recent-${i}`, time: { created: now - i } })),
    ...Array.from({ length: 658 }, (_, i) => ({
      id: `old-${i}`,
      directory: i % 2 ? "/removed-worktree" : undefined,
      projectID: "historical-project",
      time: { created: now - 100 * 86400000 },
    })),
  ] as Session[]
  vi.doMock("@/stores/useGlobalSessionsStore", async () => ({
    ...(await vi.importActual<typeof import("@/stores/useGlobalSessionsStore")>("@/stores/useGlobalSessionsStore")),
    ensureGlobalSessionsLoaded: vi.fn(async () => ({ activeSessions: sessions })),
  }))
  const { useSessionAutoCleanup } = await import("./useSessionAutoCleanup")
  const { useSessionUIStore } = await import("@/sync/session-ui-store")
  const { useUIStore } = await import("@/stores/useUIStore")
  const { axCodeClient } = await import("@/lib/ax-code/client")
  const update = vi.fn(async () => ({ data: {} }))
  const scoped = vi.spyOn(axCodeClient, "getScopedSdkClient").mockReturnValue({ session: { update } } as never)
  const fetch = vi.fn(async () =>
    supportsGlobalArchive ? new Response("{}", { status: 200 }) : new Response("404 Not Found", { status: 404 }),
  )
  vi.stubGlobal("fetch", fetch)
  useSessionUIStore.setState({ currentSessionId: null, isLoading: false })
  useUIStore.setState({
    autoDeleteEnabled: true,
    autoDeleteAfterDays: 30,
    sessionRetentionAction: "archive",
    autoDeleteLastRunAt: 0,
  })
  let hook!: ReturnType<typeof useSessionAutoCleanup>
  const Probe = () => {
    hook = useSessionAutoCleanup({ autoRun: false })
    return null
  }
  Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true })
  const root = createRoot(document.createElement("div"))
  try {
    act(() => root.render(<Probe />))
    const result = await act(async () => hook.runCleanup({ force: true }))
    if (supportsGlobalArchive) {
      // Includes sessions with removed directories and sessions with no directory metadata.
      expect(result.completedIds).toHaveLength(658)
      expect(result.failedIds).toEqual([])
      expect(fetch).toHaveBeenCalledTimes(658)
      expect(scoped).not.toHaveBeenCalled()
      expect(useUIStore.getState().autoDeleteLastRunAt).toBeGreaterThan(0)
    } else {
      expect(fetch).toHaveBeenCalledTimes(1)
      expect(update).toHaveBeenCalledTimes(329)
      expect(result.completedIds).toHaveLength(329)
      expect(result.failedIds).toHaveLength(329)
      expect(result.failureReason).toMatch(/Update the runtime/)
      expect(useUIStore.getState().autoDeleteLastRunAt).toBe(0)
    }
  } finally {
    act(() => root.unmount())
    vi.restoreAllMocks()
    vi.unstubAllGlobals()
    vi.doUnmock("@/stores/useGlobalSessionsStore")
  }
})
