import React, { act } from "react"
import { createRoot, type Root } from "react-dom/client"
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest"
import { I18nProvider } from "@/lib/i18n"

const { refreshPoints, rollbackState } = vi.hoisted(() => ({
  refreshPoints: vi.fn(),
  rollbackState: {
    points: [] as Array<Record<string, unknown>>,
  },
}))

const stubStore = <State extends object>(state: State) => {
  const useStore = ((selector?: (value: State) => unknown) => (selector ? selector(state) : state)) as unknown as {
    (selector?: (value: State) => unknown): unknown
    getState: () => State
  }
  useStore.getState = () => state
  return useStore
}

vi.mock("@/sync/session-ui-store", () => ({
  useSessionUIStore: stubStore({
    currentSessionId: "ses_1",
    getDirectoryForSession: () => "/repo",
    revertToMessage: vi.fn(),
    forkFromMessage: vi.fn(),
    applyRollbackPoint: vi.fn(),
  }),
}))
vi.mock("@/sync/sync-context", () => ({ useSessionMessageRecords: () => [] }))
vi.mock("@/lib/device", () => ({ useDeviceInfo: () => ({ isMobile: false, isTablet: false }) }))
vi.mock("@/stores/useSessionRollbackStore", () => ({
  useSessionRollbackStore: stubStore({
    getPoints: () => rollbackState.points,
    isLoading: () => false,
    getError: () => null,
    refreshPoints,
    previewRollback: vi.fn(),
  }),
}))

const { TimelineDialog } = await import("./TimelineDialog")

describe("TimelineDialog rollback refresh failures", () => {
  let container: HTMLDivElement
  let root: Root
  let unhandled: unknown[]

  beforeEach(() => {
    ;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true
    refreshPoints.mockReset()
    refreshPoints.mockResolvedValue([])
    rollbackState.points = [{ step: 1, messageID: "msg_1", partID: "prt_1", tools: [], kinds: [] }]
    unhandled = []
    process.on("unhandledRejection", (reason) => unhandled.push(reason))
    container = document.createElement("div")
    document.body.appendChild(container)
    root = createRoot(container)
    render(true)
  })

  afterEach(() => {
    act(() => root.unmount())
    container.remove()
    document.body.innerHTML = ""
    process.removeAllListeners("unhandledRejection")
  })

  const render = (open: boolean) =>
    act(() => {
      root.render(
        <I18nProvider>
          <TimelineDialog open={open} onOpenChange={() => {}} />
        </I18nProvider>,
      )
    })

  const flushRejection = () =>
    act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 0))
    })

  test("swallows a failed automatic refresh", async () => {
    refreshPoints.mockReset()
    refreshPoints.mockImplementation(() => Promise.reject(new Error("refresh failed")))

    // Closing returns before the refresh effect; opening runs it again with the
    // rejecting implementation.
    render(false)
    render(true)
    await flushRejection()

    expect(refreshPoints).toHaveBeenCalled()
    expect(unhandled).toEqual([])
  })

  test("swallows a failed manual refresh", async () => {
    const refresh = document.body.querySelector<HTMLButtonElement>('button[aria-label="Refresh rollback points"]')
    if (!refresh) throw new Error("refresh button not found")

    refreshPoints.mockReset()
    refreshPoints.mockImplementation(() => Promise.reject(new Error("refresh failed")))

    act(() => refresh.click())
    await flushRejection()

    expect(refreshPoints).toHaveBeenCalledTimes(1)
    expect(unhandled).toEqual([])
  })
})
