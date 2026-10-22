import React, { act } from "react"
import { createRoot } from "react-dom/client"
import { expect, test, vi } from "vitest"
import type { Session } from "@defai-digital/ax-code-sdk/v2"

for (const stage of ["loading", "deleting", "failure"] as const) {
  test(
    stage === "failure"
      ? "does not impose a daily cooldown after failed retention"
      : `protects a session selected while cleanup is ${stage}`,
    async () => {
      vi.resetModules()
      let releaseLoad!: () => void
      let releaseDelete!: () => void
      const now = Date.now()
      const session = (id: string, created: number): Session => ({
        id, slug: id, projectID: "project", title: id, version: "1.0.0", directory: "/repo", time: { created, updated: created },
      })
      const sessions = [
        ...Array.from({ length: 5 }, (_, i) => session(`recent-${i}`, now - i)),
        ...["old-1", "old-2", "old-3"].map((id) => session(id, now - 100 * 86400000)),
      ]
      const loaded = new Promise<{ activeSessions: typeof sessions }>((resolve) => {
        releaseLoad = () => resolve({ activeSessions: sessions })
      })
      const firstDelete = new Promise<void>((resolve) => {
        releaseDelete = resolve
      })
      vi.doMock("@/stores/useGlobalSessionsStore", async () => ({
        ...(await vi.importActual<typeof import("@/stores/useGlobalSessionsStore")>("@/stores/useGlobalSessionsStore")),
        ensureGlobalSessionsLoaded: vi.fn(() => loaded),
      }))
      const { useSessionAutoCleanup } = await import("./useSessionAutoCleanup")
      const { useSessionUIStore } = await import("@/sync/session-ui-store")
      const { useUIStore } = await import("@/stores/useUIStore")
      const { axCodeClient } = await import("@/lib/ax-code/client")
      const { useGlobalSessionsStore } = await import("@/stores/useGlobalSessionsStore")
      // Keep the real store consistent with the inventory returned by the loader.
      useGlobalSessionsStore.setState({ activeSessions: sessions, archivedSessions: [], pendingRemoval: new Map(), hasLoaded: true, status: "ready" })
      const remove = vi.fn(async ({ sessionID }: { sessionID: string }) => {
        if (stage === "deleting" && sessionID === "old-1") await firstDelete
        return stage === "failure" ? { error: new Error("unavailable") } : { data: true }
      })
      vi.spyOn(axCodeClient, "getScopedSdkClient").mockReturnValue({ session: { delete: remove } } as never)
      useSessionUIStore.setState({ currentSessionId: "initial", isLoading: false })
      useUIStore.setState({
        autoDeleteEnabled: true,
        autoDeleteAfterDays: 30,
        sessionRetentionAction: "delete",
        autoDeleteLastRunAt: 0,
      })
      let hook!: ReturnType<typeof useSessionAutoCleanup>
      // A second mount, as the app has: AppEffects runs the housekeeping cleanup and the settings page
      // has its own instance. The guard has to hold across both.
      let hookSecond!: ReturnType<typeof useSessionAutoCleanup>
      const Probe = () => {
        hook = useSessionAutoCleanup({ autoRun: false })
        hookSecond = useSessionAutoCleanup({ autoRun: false })
        return null
      }
      Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true })
      const root = createRoot(document.createElement("div"))
      try {
        act(() => root.render(<Probe />))
        let run!: ReturnType<typeof hook.runCleanup>
        act(() => {
          run = hook.runCleanup({ force: true })
        })
        if (stage === "failure") {
          await act(async () => {
            releaseLoad()
            await run
          })
          expect(useUIStore.getState().autoDeleteLastRunAt).toBe(0)
          let retry!: ReturnType<typeof hook.runCleanup>
          await act(async () => {
            retry = hook.runCleanup()
            await retry
          })
          await expect(retry).resolves.toMatchObject({ completedIds: [], failedIds: ["old-1", "old-2", "old-3"] })
          expect(remove).toHaveBeenCalledTimes(6)
          return
        }
        if (stage === "loading") {
          // The second instance's manual run joins the one in flight instead of iterating the same
          // candidates: a per-instance guard deleted every session twice and reported the sessions it
          // had just deleted as failures.
          let joined!: ReturnType<typeof hookSecond.runCleanup>
          act(() => {
            joined = hookSecond.runCleanup({ force: true })
          })
          act(() => useSessionUIStore.setState({ currentSessionId: "old-2" }))
          await act(async () => {
            releaseLoad()
            await run
          })
          await act(async () => {
            await joined
          })
          expect(remove.mock.calls.map(([args]) => args.sessionID)).toEqual(["old-1", "old-3"])
          await expect(joined).resolves.toMatchObject({ completedIds: ["old-1", "old-3"], failedIds: [] })
          return
        }
        await act(async () => releaseLoad())
        expect(remove).toHaveBeenCalledWith({ sessionID: "old-1", directory: "/repo" })
        act(() => useSessionUIStore.setState({ currentSessionId: "old-2" }))
        await act(async () => {
          releaseDelete()
          await run
        })
        expect(remove.mock.calls.map(([args]) => args.sessionID)).toEqual(["old-1", "old-3"])
        await expect(run).resolves.toMatchObject({ completedIds: ["old-1", "old-3"], failedIds: [] })
      } finally {
        act(() => root.unmount())
        vi.restoreAllMocks()
        vi.doUnmock("@/stores/useGlobalSessionsStore")
        vi.resetModules()
      }
    },
  )
}
