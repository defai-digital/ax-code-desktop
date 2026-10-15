import React, { act } from "react"
import { createRoot, type Root } from "react-dom/client"
import { afterEach, beforeEach, expect, test, vi, type Mock } from "vitest"
import { useRouter } from "./useRouter"
import { useSessionUIStore } from "@/sync/session-ui-store"
import { useUIStore } from "@/stores/useUIStore"

let root: Root
let releases: Map<string, () => void>
let select: Mock<(id: string | null) => Promise<void>>
const originalSelect = useSessionUIStore.getState().setCurrentSession
const Probe = () => {
  useRouter()
  return null
}
const go = (query: string) =>
  act(() => {
    window.history.replaceState(null, "", "/" + query)
    window.dispatchEvent(new PopStateEvent("popstate"))
  })

beforeEach(() => {
  Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true })
  releases = new Map()
  select = vi.fn(async (id: string | null) => {
    if (!id) return
    await new Promise<void>((resolve) => releases.set(id, resolve))
    useSessionUIStore.setState({ currentSessionId: id })
  })
  useSessionUIStore.setState({ currentSessionId: "initial", setCurrentSession: select })
  useUIStore.setState({ activeMainTab: "chat", isSettingsDialogOpen: false, pendingDiffFile: null })
  window.history.replaceState(null, "", "/")
  root = createRoot(document.createElement("div"))
  act(() => root.render(<Probe />))
})
afterEach(() => {
  act(() => root.unmount())
  useSessionUIStore.setState({ setCurrentSession: originalSelect })
})

test("applies the newest history route after an in-flight session selection", async () => {
  go("?session=first&tab=git")
  go("?session=second&tab=files")
  await act(async () => releases.get("first")?.())
  expect(select.mock.calls.map(([id]) => id)).toEqual(["first", "second"])
  await act(async () => releases.get("second")?.())
  expect(useSessionUIStore.getState().currentSessionId).toBe("second")
  expect(useUIStore.getState().activeMainTab).toBe("files")
  expect(new URLSearchParams(window.location.search).get("session")).toBe("second")
})

test("a history entry without parameters supersedes pending settings navigation", async () => {
  go("?session=first&settings=providers")
  go("")
  await act(async () => releases.get("first")?.())
  expect(useUIStore.getState().isSettingsDialogOpen).toBe(false)
  expect(useUIStore.getState().activeMainTab).toBe("chat")
  expect(new URLSearchParams(window.location.search).has("settings")).toBe(false)
})

test("keeps same-turn navigation with the production synchronous selection contract", async () => {
  const syncSelect = vi.fn((id: string | null) => {
    useSessionUIStore.setState({ currentSessionId: id })
  })
  act(() => useSessionUIStore.setState({ setCurrentSession: syncSelect }))
  go("?session=first&tab=git")
  go("?session=second&tab=files")
  await act(async () => {})
  expect(syncSelect.mock.calls.map(([id]) => id)).toEqual(["first", "second"])
  expect(useSessionUIStore.getState().currentSessionId).toBe("second")
  expect(useUIStore.getState().activeMainTab).toBe("files")
})
