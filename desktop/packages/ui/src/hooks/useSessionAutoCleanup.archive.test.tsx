import React, { act } from "react"
import { createRoot } from "react-dom/client"
import { expect, test, vi } from "vitest"
import type { Session } from "@defai-digital/ax-code-sdk/v2"
import { useSessionAutoCleanup } from "./useSessionAutoCleanup"
import { useSessionUIStore } from "@/sync/session-ui-store"
import { useUIStore } from "@/stores/useUIStore"
import { axCodeClient } from "@/lib/ax-code/client"
import { useGlobalSessionsStore } from "@/stores/useGlobalSessionsStore"

const { loadSessions } = vi.hoisted(() => ({ loadSessions: vi.fn() }))
vi.mock("@/stores/useGlobalSessionsStore", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/stores/useGlobalSessionsStore")>()),
  ensureGlobalSessionsLoaded: loadSessions,
}))
// Load the real dependency graph during module setup, outside the behavior's
// five-second budget. Keep the real stores and mock only the inventory loader.

test.each([true, false])("retention archive supports the global API: %s", async (supportsGlobalArchive) => {
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
  loadSessions.mockResolvedValue({ activeSessions: sessions })
  // The loader publishes this inventory to the store before resolving.
  useGlobalSessionsStore.setState({ activeSessions: sessions, archivedSessions: [], pendingRemoval: new Map(), hasLoaded: true, status: "ready" })
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
  }
})
