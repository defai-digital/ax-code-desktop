import { act } from "react"
import { createRoot, type Root } from "react-dom/client"
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest"
import type { VirtualItem } from "@tanstack/react-virtual"
import type { Message } from "@defai-digital/ax-code-sdk/v2"
import { I18nProvider } from "@/lib/i18n"
import type { ChatMessageEntry, TurnRecord } from "./lib/turns/types"
import MessageList from "./MessageList-impl"

const state = vi.hoisted(() => ({ rows: [] as VirtualItem[], notify: () => {} }))

vi.mock("@tanstack/react-virtual", async (importOriginal) => {
  const original = await importOriginal<typeof import("@tanstack/react-virtual")>()
  const React = await import("react")
  // Match TanStack's stable instance identity while its visible range changes.
  const instance = {
    getVirtualItems: () => state.rows,
    getTotalSize: () => 1400,
    measure: vi.fn(),
    measureElement: vi.fn(),
    scrollToIndex: vi.fn(),
  }
  return {
    ...original,
    useVirtualizer: () => {
      const [, rerender] = React.useReducer((revision: number) => revision + 1, 0)
      state.notify = rerender
      return instance
    },
  }
})

vi.mock("./ChatMessage", () => ({ default: () => null }))
vi.mock("./components/TurnItem", () => ({
  default: ({ turn }: { turn: TurnRecord }) => <div data-testid={`turn-${turn.turnId}`} />,
}))

const createMessages = (count: number): ChatMessageEntry[] =>
  Array.from({ length: count }, (_, index) => ({
    info: { id: `u${index}`, role: "user", time: { created: index } } as Message,
    parts: [],
  }))

const row = (index: number): VirtualItem => ({
  index,
  key: `turn:u${index}`,
  start: index * 140,
  end: (index + 1) * 140,
  size: 140,
  lane: 0,
})

describe("MessageList visible history", () => {
  let container: HTMLDivElement
  let root: Root

  beforeEach(() => {
    vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true)
    state.rows = []
    state.notify = () => {}
    container = document.createElement("div")
    document.body.appendChild(container)
    root = createRoot(container)
  })

  afterEach(() => {
    act(() => root.unmount())
    container.remove()
    vi.unstubAllGlobals()
  })

  const render = (count: number) => {
    act(() => {
      root.render(
        <I18nProvider>
          <MessageList
            sessionKey="virtualization-test"
            turnStart={0}
            messages={createMessages(count)}
            onMessageContentChange={() => {}}
            getAnimationHandlers={() => ({ onChunk: () => {}, onComplete: () => {} })}
            hasMoreAbove={false}
            isLoadingOlder={false}
            onLoadOlder={() => {}}
          />
        </I18nProvider>,
      )
    })
  }

  const visibleHistory = () =>
    Array.from(container.querySelectorAll("[data-turn-entry]"), (element) => element.getAttribute("data-turn-entry"))

  test("replaces the initial fallback with measured rows and keeps the tail mounted", () => {
    render(11)
    expect(visibleHistory()).toHaveLength(10)

    act(() => {
      state.rows = [row(7), row(8), row(9)]
      state.notify()
    })
    expect(visibleHistory()).toEqual(["turn:u7", "turn:u8", "turn:u9"])
    expect(container.querySelector('[data-testid="turn-u10"]')).not.toBeNull()
    expect(container.querySelector('[data-testid="turn-u0"]')).toBeNull()
  })

  test("updates mounted history when scrolling changes the range on the same instance", () => {
    state.rows = [row(0), row(1)]
    render(11)
    expect(visibleHistory()).toEqual(["turn:u0", "turn:u1"])

    act(() => {
      state.rows = [row(5), row(6)]
      state.notify()
    })
    expect(visibleHistory()).toEqual(["turn:u5", "turn:u6"])
    expect(container.querySelector('[data-testid="turn-u10"]')).not.toBeNull()
  })

  test("renders all history for a conversation below the virtualization threshold", () => {
    state.rows = [row(0)]
    render(4)
    expect(visibleHistory()).toEqual(["turn:u0", "turn:u1", "turn:u2"])
    expect(container.querySelector('[data-testid="turn-u3"]')).not.toBeNull()
  })
})
