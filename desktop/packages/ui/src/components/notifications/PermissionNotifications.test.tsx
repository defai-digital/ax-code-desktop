import React, { act } from "react"
import { createRoot, type Root } from "react-dom/client"
import { afterEach, beforeEach, expect, test, vi } from "vitest"

type PendingRequest = { kind: "permission" | "question"; sessionId: string; request: { id: string } }

const mocks = vi.hoisted(() => {
  const listeners = new Set<() => void>()
  let pending: PendingRequest[] = []
  return {
    sessions: [] as Array<{ id: string; title: string }>,
    permissions: [] as Array<{ id: string; permission: string; patterns: string[] }>,
    get pending() {
      return pending
    },
    set pending(next: PendingRequest[]) {
      pending = next
      for (const listener of listeners) listener()
    },
    subscribe(listener: () => void) {
      listeners.add(listener)
      return () => {
        listeners.delete(listener)
      }
    },
    setBadge: vi.fn<(count: number) => Promise<void>>(async () => undefined),
  }
})

vi.mock("@/sync/sync-context", async () => {
  const React = await import("react")
  const usePendingRequests = () => React.useSyncExternalStore(mocks.subscribe, () => mocks.pending)
  return {
    useAllLiveSessions: () => mocks.sessions,
    useAllPendingRequests: usePendingRequests,
    useSessionPermissions: () => mocks.permissions,
  }
})
vi.mock("@/lib/desktop", () => ({ isDesktopShell: () => true }))
vi.mock("@/lib/desktopNative", () => ({ setDesktopBadgeCount: mocks.setBadge }))
vi.mock("@/lib/i18n", () => ({ useI18n: () => ({ t: (key: string) => key }) }))
vi.mock("@/components/ui", () => ({ toast: { info: vi.fn(), dismiss: vi.fn() } }))

import { useAttentionStore } from "@/stores/useAttentionStore"
import { useSupervisionStore } from "@/stores/useSupervisionStore"
import { useNotificationStore } from "@/stores/useNotificationStore"
import { PermissionNotifications } from "./PermissionNotifications"

let root: Root
let container: HTMLDivElement
beforeEach(() => {
  Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true })
  mocks.pending = []
  mocks.sessions = []
  mocks.permissions = []
  useNotificationStore.getState().clearAll()
  useSupervisionStore.setState({ rows: [] })
  mocks.setBadge.mockClear()
  container = document.createElement("div")
  root = createRoot(container)
})
afterEach(() => {
  act(() => root.unmount())
})

type Row = ReturnType<typeof useSupervisionStore.getState>["rows"][number]
const row = (sessionId: string, state: Row["state"]) => ({ sessionId, directory: "/repo", state }) as unknown as Row

test("the badge counts sessions that need you, the number the titlebar pill shows", () => {
  // Two requests in session a and one in b are two sessions; a blocked goal counts, a failure does not.
  useSupervisionStore.setState({
    rows: [row("a", "permission"), row("b", "question"), row("c", "goal"), row("d", "error"), row("e", "running")],
  })
  act(() => root.render(<PermissionNotifications />))
  expect(mocks.setBadge).toHaveBeenLastCalledWith(3)
  expect(useAttentionStore.getState().pendingApprovalCount).toBe(3)
})

test("clears the badge when nothing needs you any more", () => {
  useSupervisionStore.setState({ rows: [row("a", "question")] })
  act(() => root.render(<PermissionNotifications />))
  expect(mocks.setBadge).toHaveBeenLastCalledWith(1)
  act(() => {
    useSupervisionStore.setState({ rows: [row("a", "running")] })
  })
  expect(mocks.setBadge).toHaveBeenLastCalledWith(0)
  expect(useAttentionStore.getState().pendingApprovalCount).toBe(0)
})

test("a pending permission is not copied into the notification center", () => {
  mocks.sessions = [{ id: "a", title: "Fix login" }]
  mocks.permissions = [{ id: "perm-1", permission: "bash", patterns: ["rm -rf build"] }]
  mocks.pending = [{ kind: "permission", sessionId: "a", request: { id: "perm-1" } }]
  act(() => root.render(<PermissionNotifications />))
  // It is answered in one place, the Needs you inbox.
  expect(useNotificationStore.getState().notifications).toEqual([])
})
