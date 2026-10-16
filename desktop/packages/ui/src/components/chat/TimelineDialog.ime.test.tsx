import React, { act } from "react"
import { createRoot, type Root } from "react-dom/client"
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest"
import type { Message, Part } from "@defai-digital/ax-code-sdk/v2"
import { I18nProvider } from "@/lib/i18n"

const { scrollToMessageMock, openChangeMock } = vi.hoisted(() => ({
  scrollToMessageMock: vi.fn(),
  openChangeMock: vi.fn(),
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

const records = [
  {
    info: { id: "msg_1", sessionID: "ses_1", role: "user", time: { created: 100 } } as Message,
    parts: [{ id: "prt_1", sessionID: "ses_1", messageID: "msg_1", type: "text", text: "alpha" } as Part],
  },
  {
    info: { id: "msg_2", sessionID: "ses_1", role: "user", time: { created: 200 } } as Message,
    parts: [{ id: "prt_2", sessionID: "ses_1", messageID: "msg_2", type: "text", text: "beta" } as Part],
  },
]

vi.mock("@/sync/sync-context", () => ({ useSessionMessageRecords: () => records }))
vi.mock("@/lib/device", () => ({ useDeviceInfo: () => ({ isMobile: false, isTablet: false }) }))
vi.mock("@/stores/useSessionRollbackStore", () => ({
  useSessionRollbackStore: stubStore({
    getPoints: () => [],
    isLoading: () => false,
    getError: () => null,
    refreshPoints: vi.fn(),
    previewRollback: vi.fn(),
  }),
}))

const { TimelineDialog } = await import("./TimelineDialog")

describe("TimelineDialog search input", () => {
  let container: HTMLDivElement
  let root: Root
  const originalScrollIntoView = Object.getOwnPropertyDescriptor(HTMLElement.prototype, "scrollIntoView")

  beforeEach(() => {
    ;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true
    scrollToMessageMock.mockReset()
    openChangeMock.mockReset()
    Object.defineProperty(HTMLElement.prototype, "scrollIntoView", { configurable: true, value: () => {} })
    container = document.createElement("div")
    document.body.appendChild(container)
    root = createRoot(container)
    act(() =>
      root.render(
        <I18nProvider>
          <TimelineDialog open onOpenChange={openChangeMock} onScrollToMessage={scrollToMessageMock} />
        </I18nProvider>,
      ),
    )
  })

  afterEach(() => {
    act(() => root.unmount())
    container.remove()
    document.body.innerHTML = ""
    if (originalScrollIntoView) Object.defineProperty(HTMLElement.prototype, "scrollIntoView", originalScrollIntoView)
  })

  const input = () => document.body.querySelector<HTMLInputElement>("input")!

  const typeQuery = (value: string) => {
    const element = input()
    const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, "value")!.set!
    act(() => {
      setter.call(element, value)
      element.dispatchEvent(new Event("input", { bubbles: true }))
    })
  }

  const press = (key: string, { isComposing = false } = {}) =>
    act(() => {
      input().dispatchEvent(new KeyboardEvent("keydown", { bubbles: true, cancelable: true, key, isComposing }))
    })

  test("leaves the keys an input method is consuming to the composition", () => {
    // Both branches acted on the composition's keys: Enter navigated to the message the half-typed query matched
    // and closed the dialog, and the arrows moved the highlight instead of the candidate list. The app is
    // localized, so the search field is normally used with a composition open.
    typeQuery("a")

    press("ArrowDown", { isComposing: true })
    press("Enter")

    // The composing ArrowDown did not move the highlight off the first result.
    expect(scrollToMessageMock).toHaveBeenCalledTimes(1)
    expect(scrollToMessageMock.mock.calls[0][0]).toBe("msg_2")

    // The composing Enter committed the composition, not a navigation.
    press("Enter", { isComposing: true })
    expect(scrollToMessageMock).toHaveBeenCalledTimes(1)
    expect(openChangeMock).not.toHaveBeenCalled()
  })
})
