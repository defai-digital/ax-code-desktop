import React, { act } from "react"
import { createRoot, type Root } from "react-dom/client"
import { afterEach, beforeEach, expect, test, vi } from "vitest"

type PendingRequest = { kind: "permission" | "question"; sessionId: string; request: { id: string } }

const mocks = vi.hoisted(() => {
  const listeners = new Set<() => void>()
  let pending: PendingRequest[] = []
  return {
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
    useAllLiveSessions: () => [],
    useAllPendingRequests: usePendingRequests,
    useSessionPermissions: () => [],
  }
})
vi.mock("@/lib/desktop", () => ({ isDesktopShell: () => true }))
vi.mock("@/lib/desktopNative", () => ({ setDesktopBadgeCount: mocks.setBadge }))
vi.mock("@/lib/i18n", () => ({ useI18n: () => ({ t: (key: string) => key }) }))
vi.mock("@/components/ui", () => ({ toast: { info: vi.fn(), dismiss: vi.fn() } }))

import { useAttentionStore } from "@/stores/useAttentionStore"
import { PermissionNotifications } from "./PermissionNotifications"

let root: Root
let container: HTMLDivElement
beforeEach(() => {
  Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true })
  mocks.pending = []
  mocks.setBadge.mockClear()
  container = document.createElement("div")
  root = createRoot(container)
})
afterEach(() => {
  act(() => root.unmount())
})

test("the badge counts permission and question requests once each, the same rule the tray uses", () => {
  mocks.pending = [
    { kind: "permission", sessionId: "a", request: { id: "1" } },
    { kind: "question", sessionId: "a", request: { id: "2" } },
    { kind: "permission", sessionId: "b", request: { id: "3" } },
    { kind: "permission", sessionId: "b", request: { id: "3" } },
  ]
  act(() => root.render(<PermissionNotifications />))
  // Three requests across two sessions: counting sessions, or permissions only, would give two.
  expect(mocks.setBadge).toHaveBeenLastCalledWith(3)
  expect(useAttentionStore.getState().pendingApprovalCount).toBe(3)
})

test("clears the badge when the requests are answered", () => {
  mocks.pending = [{ kind: "question", sessionId: "a", request: { id: "1" } }]
  act(() => root.render(<PermissionNotifications />))
  expect(mocks.setBadge).toHaveBeenLastCalledWith(1)
  act(() => {
    mocks.pending = []
    root.render(<PermissionNotifications />)
  })
  expect(mocks.setBadge).toHaveBeenLastCalledWith(0)
  expect(useAttentionStore.getState().pendingApprovalCount).toBe(0)
})
