import React, { act } from "react"
import { createRoot } from "react-dom/client"
import { afterEach, expect, test, vi } from "vitest"
import { ANALYSIS_APP_RUN_EVENT } from "@/lib/analysisAppArtifact"
const state = vi.hoisted(() => ({
  currentSessionId: "source-session",
  worktreeMetadata: new Map(),
  attachment: undefined as undefined | { cwd: string; degraded: boolean; worktreeRoot: string },
  directory: "/source",
  mobile: false,
  error: vi.fn(),
}))
vi.mock("@/lib/i18n", () => ({ useI18n: () => ({ t: (key: string) => key }) }))
vi.mock("@/lib/device", () => ({ useDeviceInfo: () => ({ isMobile: state.mobile }) }))
vi.mock("@/components/ui", () => ({ toast: { error: state.error } }))
vi.mock("@/sync/sync-context", () => ({
  useSessionDirectory: (id: string) => (id === "source-session" ? state.directory : undefined),
}))
vi.mock("@/sync/session-ui-store", () => ({
  useSessionUIStore: Object.assign((selector: (value: typeof state) => unknown) => selector(state), {
    getState: () => state,
  }),
}))
vi.mock("@/sync/session-worktree-store", () => ({
  useSessionWorktreeStore: (selector: (value: unknown) => unknown) =>
    selector({ getAttachment: () => state.attachment }),
}))
import { AnalysisAppCard } from "./AnalysisAppCard"

afterEach(() => {
  state.currentSessionId = "source-session"
  state.attachment = undefined
  state.error.mockClear()
  state.mobile = false
})

test("dispatches only on click and binds to the originating worktree", () => {
  globalThis.IS_REACT_ACT_ENVIRONMENT = true
  state.attachment = { cwd: "/source/worktree", worktreeRoot: "/source/worktree", degraded: false }
  const events: unknown[] = []
  const listener = (event: Event) => {
    events.push((event as CustomEvent).detail)
    event.preventDefault()
  }
  window.addEventListener(ANALYSIS_APP_RUN_EVENT, listener)
  const container = document.createElement("div")
  const root = createRoot(container)
  const render = () =>
    root.render(
      <AnalysisAppCard sessionId="source-session" artifact={{ version: 1, kind: "streamlit", entrypoint: "app.py" }} />,
    )
  try {
    act(render)
    expect(events).toEqual([])
    act(() => container.querySelector("button")!.click())
    expect(events).toEqual([
      {
        sessionId: "source-session",
        directory: "/source/worktree",
        artifact: { version: 1, kind: "streamlit", entrypoint: "app.py" },
      },
    ])
    state.currentSessionId = "other-session"
    // The click-time guard also covers a selection change before React rerenders.
    act(() => container.querySelector("button")!.click())
    expect(events).toHaveLength(1)
    act(render)
    expect(container.querySelector("button")!.disabled).toBe(true)
  } finally {
    act(() => root.unmount())
    window.removeEventListener(ANALYSIS_APP_RUN_EVENT, listener)
  }
})

test("reports an unhandled handoff rather than claiming an app started", () => {
  const container = document.createElement("div")
  const root = createRoot(container)
  act(() =>
    root.render(
      <AnalysisAppCard sessionId="source-session" artifact={{ version: 1, kind: "streamlit", entrypoint: "app.py" }} />,
    ),
  )
  act(() => container.querySelector("button")!.click())
  expect(state.error).toHaveBeenCalledTimes(1)
  act(() => root.unmount())
})

test("explains the unavailable mobile action without dispatching it", () => {
  state.mobile = true
  const container = document.createElement("div")
  const root = createRoot(container)
  act(() =>
    root.render(
      <AnalysisAppCard sessionId="source-session" artifact={{ version: 1, kind: "streamlit", entrypoint: "app.py" }} />,
    ),
  )
  expect(container.querySelector("button")!.disabled).toBe(true)
  expect(container.textContent).toContain("projectActions.streamlit.desktopWindow")
  act(() => container.querySelector("button")!.click())
  expect(state.error).not.toHaveBeenCalled()
  act(() => root.unmount())
})
