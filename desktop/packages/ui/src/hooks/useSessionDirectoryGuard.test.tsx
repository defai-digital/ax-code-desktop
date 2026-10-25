import React, { act } from "react"
import { createRoot, type Root } from "react-dom/client"
import { afterEach, beforeEach, expect, test, vi } from "vitest"
import { useSessionUIStore } from "@/sync/session-ui-store"
import { useProjectsStore } from "@/stores/useProjectsStore"
import { useSessionDirectoryGuard } from "./useSessionDirectoryGuard"

const mocks = vi.hoisted(() => ({ clear: vi.fn(), client: vi.fn(() => "/a") }))
vi.mock("@/lib/ax-code/client", () => ({ axCodeClient: { getDirectory: mocks.client } }))
vi.mock("@/sync/session-ui-store", async () => {
  const { create } = await import("zustand")
  return {
    useSessionUIStore: create(() => ({
      currentSessionId: "foreign",
      availableWorktreesByProject: new Map(),
      clearCurrentSessionIfOutsideDirectory: mocks.clear,
    })),
  }
})
vi.mock("@/stores/useProjectsStore", async () => {
  const { create } = await import("zustand")
  return { useProjectsStore: create(() => ({ projects: [{ id: "a", path: "/a" }] })) }
})

let root: Root
function Probe(props: { enabled: boolean }): React.ReactNode {
  useSessionDirectoryGuard({ directory: "/a", enabled: props.enabled })
  return null
}
beforeEach(() => {
  globalThis.IS_REACT_ACT_ENVIRONMENT = true
  mocks.clear.mockClear()
  mocks.client.mockReturnValue("/a")
  root = createRoot(document.createElement("div"))
})
afterEach(() => act(() => root.unmount()))

test("reevaluates ownership when worktree metadata arrives", () => {
  act(() => root.render(<Probe enabled />))
  expect(mocks.clear).toHaveBeenCalledExactlyOnceWith("/a")
  act(() => useSessionUIStore.setState({ availableWorktreesByProject: new Map() }))
  expect(mocks.clear).toHaveBeenCalledTimes(2)
})

test("reevaluates a registry replacement with the same project count", () => {
  act(() => root.render(<Probe enabled />))
  act(() => useProjectsStore.setState({ projects: [{ id: "b", path: "/a" }] }))
  expect(mocks.clear).toHaveBeenCalledTimes(2)
})

test("does not clear a selection before client alignment or while disabled", () => {
  mocks.client.mockReturnValue("/b")
  act(() => root.render(<Probe enabled />))
  expect(mocks.clear).not.toHaveBeenCalled()
  mocks.client.mockReturnValue("/a")
  act(() => root.render(<Probe enabled={false} />))
  expect(mocks.clear).not.toHaveBeenCalled()
  act(() => root.render(<Probe enabled />))
  expect(mocks.clear).toHaveBeenCalledExactlyOnceWith("/a")
})
