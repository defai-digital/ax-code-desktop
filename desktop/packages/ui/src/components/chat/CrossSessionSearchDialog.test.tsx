import React, { act } from "react"
import { createRoot, type Root } from "react-dom/client"
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest"
import type { Message, Part, Session } from "@defai-digital/ax-code-sdk/v2"
import { I18nProvider } from "@/lib/i18n"

const { listMock, messagesMock, openSessionMock, setOpenMock, setPendingMock } = vi.hoisted(() => ({
  listMock: vi.fn(),
  messagesMock: vi.fn(),
  openSessionMock: vi.fn(),
  setOpenMock: vi.fn(),
  setPendingMock: vi.fn(),
}))

const stubStore = <State extends object>(state: State) => {
  const useStore = ((selector?: (value: State) => unknown) => (selector ? selector(state) : state)) as unknown as {
    (selector?: (value: State) => unknown): unknown
    getState: () => State
  }
  useStore.getState = () => state
  return useStore
}

vi.mock("@/lib/ax-code/client", () => ({
  axCodeClient: {
    getSdkClient: () => ({
      session: {
        list: (...args: unknown[]) => listMock(...args),
        messages: (...args: unknown[]) => messagesMock(...args),
      },
    }),
    getDirectory: () => "/repo",
  },
}))
vi.mock("@/hooks/useEffectiveDirectory", () => ({ useEffectiveDirectory: () => "/repo" }))
vi.mock("@/stores/useUIStore", () => ({
  useUIStore: stubStore({
    isCrossSessionSearchOpen: true,
    setCrossSessionSearchOpen: setOpenMock,
    setPendingMessageNavigation: setPendingMock,
  }),
}))
vi.mock("@/stores/useDirectoryStore", () => ({
  useDirectoryStore: stubStore({ currentDirectory: "/repo" }),
}))
vi.mock("@/stores/useGlobalSessionsStore", () => ({
  useGlobalSessionsStore: stubStore({ activeSessions: [] as Session[] }),
}))
vi.mock("@/lib/supervision/openSession", () => ({ openSupervisedSession: openSessionMock }))
vi.mock("@/components/icon/Icon", () => ({ Icon: () => null }))

const { CrossSessionSearchDialog } = await import("./CrossSessionSearchDialog")

const session = (id: string, title: string, updated: number): Session =>
  ({
    id,
    slug: id,
    projectID: "proj_1",
    directory: "/repo",
    title,
    version: "1",
    time: { created: 1, updated },
  }) as Session

const record = (role: "user" | "assistant", text: string, id: string, created: number) => ({
  info: { id, sessionID: "ses", role, time: { created } } as Message,
  parts: [{ id: `prt_${id}`, sessionID: "ses", messageID: id, type: "text", text } as Part],
})

const sessions = [
  session("ses_1", "Fix preview", 30),
  session("ses_2", "Ship release", 20),
  session("ses_3", "Docs", 10),
]

const wait = async (ms: number) => {
  await act(async () => {
    await new Promise((resolve) => setTimeout(resolve, ms))
  })
}

describe("CrossSessionSearchDialog", () => {
  let container: HTMLDivElement
  let root: Root
  const originalScrollIntoView = Object.getOwnPropertyDescriptor(HTMLElement.prototype, "scrollIntoView")

  beforeEach(async () => {
    listMock.mockReset()
    messagesMock.mockReset()
    openSessionMock.mockReset()
    setOpenMock.mockReset()
    setPendingMock.mockReset()
    Object.defineProperty(HTMLElement.prototype, "scrollIntoView", { configurable: true, value: () => {} })

    listMock.mockResolvedValue({ data: sessions, error: undefined })
    messagesMock.mockImplementation(async (params: { sessionID: string }) => {
      if (params.sessionID === "ses_1") return { data: [record("user", "deploy the preview build", "msg_1", 100)] }
      if (params.sessionID === "ses_2") return { data: [record("assistant", "Deploy finished cleanly", "msg_2", 300)] }
      return { data: [record("user", "update the readme", "msg_3", 200)] }
    })

    container = document.createElement("div")
    document.body.appendChild(container)
    root = createRoot(container)
    act(() =>
      root.render(
        <I18nProvider>
          <CrossSessionSearchDialog />
        </I18nProvider>,
      ),
    )
    await wait(20)
  })

  afterEach(() => {
    act(() => root.unmount())
    container.remove()
    document.body.innerHTML = ""
    if (originalScrollIntoView) Object.defineProperty(HTMLElement.prototype, "scrollIntoView", originalScrollIntoView)
  })

  const input = () => document.body.querySelector<HTMLInputElement>('input[placeholder*="all sessions"]')!
  const bodyText = () => document.body.textContent ?? ""

  const pressComposing = (key: string) =>
    act(() => {
      input().dispatchEvent(new KeyboardEvent("keydown", { bubbles: true, cancelable: true, key, isComposing: true }))
    })

  const typeQuery = async (value: string) => {
    const element = input()
    const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, "value")!.set!
    act(() => {
      setter.call(element, value)
      element.dispatchEvent(new Event("input", { bubbles: true }))
    })
    // Outlast the 250ms debounce, then let the scan settle.
    await wait(320)
  }

  const press = (key: string) =>
    act(() => {
      input().dispatchEvent(new KeyboardEvent("keydown", { bubbles: true, cancelable: true, key }))
    })

  test("loads sessions on open and asks for a longer query before scanning", async () => {
    expect(listMock).toHaveBeenCalledWith(
      expect.objectContaining({ directory: "/repo", roots: true, limit: 50 }),
      expect.anything(),
    )
    expect(bodyText()).toContain("Type at least 2 characters to search")

    await typeQuery("d")
    expect(messagesMock).not.toHaveBeenCalled()
    expect(bodyText()).toContain("Type at least 2 characters to search")
  })

  test("shows progressive scan status and highlighted hits newest first", async () => {
    let releaseSlow: ((value: unknown) => void) | undefined
    messagesMock.mockImplementation((params: { sessionID: string }) => {
      if (params.sessionID === "ses_2") {
        return new Promise((resolve) => {
          releaseSlow = resolve
        })
      }
      if (params.sessionID === "ses_1") {
        return Promise.resolve({ data: [record("user", "deploy the preview build", "msg_1", 100)] })
      }
      return Promise.resolve({ data: [record("user", "update the readme", "msg_3", 200)] })
    })

    await typeQuery("deploy")
    // ses_1 and ses_3 finished; ses_2 is still in flight.
    expect(bodyText()).toContain("Scanned 2 of 3 sessions")
    expect(bodyText()).toContain("Fix preview")

    await act(async () => {
      releaseSlow?.({ data: [record("assistant", "Deploy finished cleanly", "msg_2", 300)] })
    })
    await wait(20)

    expect(bodyText()).toContain("Scanned 3 of 3 sessions")
    const marks = Array.from(document.body.querySelectorAll("mark")).map((mark) => mark.textContent)
    expect(marks).toEqual(["Deploy", "deploy"])
  })

  test("ArrowDown then Enter opens the selected session at its message", async () => {
    await typeQuery("deploy")
    expect(bodyText()).toContain("Ship release")

    // Newest hit (ses_2) is selected first; ArrowDown moves to ses_1, ArrowUp back.
    press("ArrowDown")
    press("ArrowUp")
    press("ArrowDown")
    press("Enter")

    expect(setPendingMock).toHaveBeenCalledWith({ sessionId: "ses_1", messageId: "msg_1" })
    expect(openSessionMock).toHaveBeenCalledWith({ sessionId: "ses_1", directory: "/repo" })
    expect(setOpenMock).toHaveBeenCalledWith(false)
  })

  test("ignores the keys an input method is consuming", async () => {
    // The search field's handler moves the highlighted hit on the arrow keys and opens it on Enter — the keys a
    // composition consumes to pick and commit its candidates. The app is localized, so the box is used this way;
    // the same guard the model picker and the inline comment field needed applies here.
    await typeQuery("deploy")

    pressComposing("ArrowDown")
    pressComposing("Enter")

    expect(openSessionMock).not.toHaveBeenCalled()
    expect(setPendingMock).not.toHaveBeenCalled()

    // The same keys act once the composition is over: Enter opens the hit still selected.
    press("Enter")
    expect(openSessionMock).toHaveBeenCalledWith({ sessionId: "ses_2", directory: "/repo" })
  })

  test("reports when nothing matches", async () => {
    await typeQuery("nonexistentterm")
    expect(bodyText()).toContain("Scanned 3 of 3 sessions")
    expect(bodyText()).toContain("No messages found")
  })

  test("shows an error with retry when the session list cannot load", async () => {
    listMock.mockReset()
    listMock.mockResolvedValueOnce({ data: undefined, error: { message: "runtime down" } })

    // Remount so the open effect loads the list again.
    act(() => root.unmount())
    root = createRoot(container)
    act(() =>
      root.render(
        <I18nProvider>
          <CrossSessionSearchDialog />
        </I18nProvider>,
      ),
    )
    await wait(20)
    expect(bodyText()).toContain("Could not load sessions")

    listMock.mockResolvedValue({ data: sessions, error: undefined })
    const retry = Array.from(document.body.querySelectorAll("button")).find((button) => button.textContent === "Retry")!
    await act(async () => {
      retry.dispatchEvent(new MouseEvent("click", { bubbles: true }))
    })
    await wait(20)
    expect(bodyText()).toContain("Type at least 2 characters to search")
  })
})
