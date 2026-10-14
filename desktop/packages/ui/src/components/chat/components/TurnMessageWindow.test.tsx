import { act } from "react"
import { createRoot, type Root } from "react-dom/client"
import { afterEach, beforeEach, describe, expect, test } from "vitest"
import type { Message } from "@defai-digital/ax-code-sdk/v2"

import { I18nProvider } from "@/lib/i18n"
import type { ChatMessageEntry } from "../lib/turns/types"
import {
  FULL_MESSAGE_WINDOW,
  TURN_MESSAGE_WINDOW_SIZE,
  TURN_MESSAGE_WINDOW_THRESHOLD,
  TurnMessageWindowContext,
  createTurnMessageWindowStore,
  isReaderAtTimelineEnd,
  openedFoldMessageWindow,
  revealNavigatedMessage,
  shouldHoldRevealAnchor,
  type TurnMessageWindowStore,
} from "../lib/turns/turnMessageWindow"
import { TurnMessageWindow } from "./TurnMessageWindow"

function assistant(id: string): ChatMessageEntry {
  return {
    info: { id, role: "assistant" } as Message,
    parts: [],
  }
}

const steps = (count: number): ChatMessageEntry[] =>
  Array.from({ length: count }, (_, index) => assistant(`step-${index}`))

const renderMessage = (message: ChatMessageEntry) => <div key={message.info.id} data-message-id={message.info.id} />

describe("turn message window", () => {
  let root: Root
  let container: HTMLDivElement

  beforeEach(() => {
    container = document.createElement("div")
    document.body.append(container)
    root = createRoot(container)
  })

  afterEach(() => {
    act(() => {
      root.unmount()
    })
    container.remove()
  })

  const renderWindow = (store: TurnMessageWindowStore | null, messages: ChatMessageEntry[]) => {
    act(() => {
      root.render(
        <I18nProvider>
          <TurnMessageWindowContext.Provider value={store}>
            <TurnMessageWindow turnId="turn" messages={messages} renderMessage={renderMessage} />
          </TurnMessageWindowContext.Provider>
        </I18nProvider>,
      )
    })
  }
  const mountedIds = () =>
    Array.from(container.querySelectorAll("[data-message-id]"), (node) => node.getAttribute("data-message-id"))
  const spacer = () => container.querySelector('[data-turn-message-spacer="head"]')
  const tailSpacer = () => container.querySelector('[data-turn-message-spacer="tail"]')

  test("a long turn mounts only its newest messages behind a spacer", () => {
    const messages = steps(100)
    renderWindow(createTurnMessageWindowStore(), messages)
    expect(mountedIds()).toEqual(messages.slice(-TURN_MESSAGE_WINDOW_SIZE).map((message) => message.info.id))
    expect(spacer()).not.toBeNull()
  })

  test("a turn at the threshold mounts every message", () => {
    renderWindow(createTurnMessageWindowStore(), steps(TURN_MESSAGE_WINDOW_THRESHOLD))
    expect(mountedIds()).toHaveLength(TURN_MESSAGE_WINDOW_THRESHOLD)
    expect(spacer()).toBeNull()
  })

  test("without a window store every message mounts", () => {
    renderWindow(null, steps(100))
    expect(mountedIds()).toHaveLength(100)
    expect(spacer()).toBeNull()
  })

  test("messages appended while the turn runs stay mounted", () => {
    const store = createTurnMessageWindowStore()
    renderWindow(store, steps(100))
    renderWindow(store, steps(110))
    expect(mountedIds()).toHaveLength(TURN_MESSAGE_WINDOW_SIZE + 10)
    expect(mountedIds().at(-1)).toBe("step-109")
  })

  test("a remounted turn keeps the messages the reader already revealed", () => {
    const store = createTurnMessageWindowStore()
    renderWindow(store, steps(100))
    act(() => {
      store.setRange("turn", { hiddenHead: 40, hiddenTail: 0 })
    })
    act(() => {
      root.unmount()
    })
    root = createRoot(container)
    renderWindow(store, steps(100))
    expect(mountedIds()).toHaveLength(60)
    expect(mountedIds()[0]).toBe("step-40")
  })

  test("navigation reveals the requested message through the store", () => {
    const store = createTurnMessageWindowStore()
    const messages = steps(100)
    store.setRange("turn", openedFoldMessageWindow(messages.length, false))
    renderWindow(store, messages)
    expect(mountedIds()).not.toContain("step-80")
    act(() => {
      revealNavigatedMessage(store, "turn", messages.length, 80)
    })
    expect(mountedIds()).toContain("step-80")
    expect(mountedIds()).not.toContain("step-81")
    expect(mountedIds()[0]).toBe("step-0")
  })

  test("a hidden tail offers a control that reveals later steps and focuses the first one", () => {
    const store = createTurnMessageWindowStore()
    const messages = steps(100)
    store.setRange("turn", openedFoldMessageWindow(messages.length, false))
    renderWindow(store, messages)
    const tail = tailSpacer() as HTMLElement
    const button = tail.querySelector("button")
    expect(tail.getAttribute("aria-hidden")).not.toBe("true")
    expect(tail.style.height).toBe(`${(100 - TURN_MESSAGE_WINDOW_SIZE) * 64}px`)
    expect(button?.className).toContain("sr-only")
    expect(button?.className).toContain("focus:not-sr-only")
    expect(button?.textContent).toBe(`Show ${100 - TURN_MESSAGE_WINDOW_SIZE} later steps`)
    act(() => {
      button?.click()
    })
    const revealed = container.querySelector<HTMLElement>('[data-message-id="step-20"]')
    expect(revealed).not.toBeNull()
    expect(revealed).toBe(document.activeElement)
    expect(mountedIds()).toContain("step-99")
    expect(tailSpacer()).toBeNull()
  })

  test("a hidden head offers a control that reveals earlier steps and focuses the first one", () => {
    const store = createTurnMessageWindowStore()
    const messages = steps(100)
    store.setRange("turn", openedFoldMessageWindow(messages.length, true))
    renderWindow(store, messages)
    const head = spacer() as HTMLElement
    const button = head.querySelector("button")
    expect(head.style.height).toBe(`${(100 - TURN_MESSAGE_WINDOW_SIZE) * 64}px`)
    expect(button?.textContent).toBe(`Show ${100 - TURN_MESSAGE_WINDOW_SIZE} earlier steps`)
    act(() => {
      button?.click()
    })
    const revealed = container.querySelector<HTMLElement>('[data-message-id="step-0"]')
    expect(revealed).toBe(document.activeElement)
    expect(mountedIds()).toHaveLength(100)
    expect(spacer()).toBeNull()
  })

  test("a single hidden step uses the singular label", () => {
    const store = createTurnMessageWindowStore()
    store.setRange("turn", { hiddenHead: 1, hiddenTail: 1 })
    renderWindow(store, steps(3))
    expect(spacer()?.querySelector("button")?.textContent).toBe("Show 1 earlier step")
    expect(tailSpacer()?.querySelector("button")?.textContent).toBe("Show 1 later step")
  })

  test("a fold opened away from the end mounts its first steps above a tail spacer", () => {
    const store = createTurnMessageWindowStore()
    store.setRange("turn", openedFoldMessageWindow(100, false))
    const messages = steps(100)
    renderWindow(store, messages)
    expect(mountedIds()).toEqual(messages.slice(0, TURN_MESSAGE_WINDOW_SIZE).map((message) => message.info.id))
    expect(spacer()).toBeNull()
    expect(tailSpacer()).not.toBeNull()
  })

  test("a fold opened on the end mounts its newest steps below a head spacer", () => {
    const store = createTurnMessageWindowStore()
    store.setRange("turn", openedFoldMessageWindow(100, true))
    const messages = steps(100)
    renderWindow(store, messages)
    expect(mountedIds()).toEqual(messages.slice(-TURN_MESSAGE_WINDOW_SIZE).map((message) => message.info.id))
    expect(spacer()).not.toBeNull()
    expect(tailSpacer()).toBeNull()
  })

  test("revealing the tail mounts the steps below the window", () => {
    const store = createTurnMessageWindowStore()
    store.setRange("turn", openedFoldMessageWindow(100, false))
    renderWindow(store, steps(100))
    act(() => {
      store.setRange("turn", { hiddenHead: 0, hiddenTail: 40 })
    })
    expect(mountedIds()).toHaveLength(60)
    expect(mountedIds().at(-1)).toBe("step-59")
  })
})

describe("opened fold window", () => {
  test("a short fold opens whole from either end", () => {
    expect(openedFoldMessageWindow(TURN_MESSAGE_WINDOW_THRESHOLD, true)).toEqual(FULL_MESSAGE_WINDOW)
    expect(openedFoldMessageWindow(TURN_MESSAGE_WINDOW_THRESHOLD, false)).toEqual(FULL_MESSAGE_WINDOW)
  })

  test("a long fold keeps the end that stays on screen", () => {
    const hidden = TURN_MESSAGE_WINDOW_THRESHOLD + 1 - TURN_MESSAGE_WINDOW_SIZE
    expect(openedFoldMessageWindow(TURN_MESSAGE_WINDOW_THRESHOLD + 1, true)).toEqual({
      hiddenHead: hidden,
      hiddenTail: 0,
    })
    expect(openedFoldMessageWindow(TURN_MESSAGE_WINDOW_THRESHOLD + 1, false)).toEqual({
      hiddenHead: 0,
      hiddenTail: hidden,
    })
  })
})

describe("reader at the timeline end", () => {
  const scrollerWith = (scrollTop: number) => {
    const scroller = document.createElement("div")
    scroller.setAttribute("data-scrollbar", "chat")
    Object.defineProperty(scroller, "scrollHeight", { value: 3000 })
    Object.defineProperty(scroller, "clientHeight", { value: 800 })
    scroller.scrollTop = scrollTop
    const header = document.createElement("button")
    scroller.append(header)
    document.body.append(scroller)
    return header
  }

  afterEach(() => {
    document.body.replaceChildren()
  })

  test("on the end, within the follow band, and away from it", () => {
    // scrollHeight 3000, clientHeight 800: distance from the end is 2200 - scrollTop.
    // The follow band is the end spacer, max(48px, 10% of 800px) = 80px, so 2120
    // is still the end and 2119 is not.
    expect(isReaderAtTimelineEnd(scrollerWith(2200))).toBe(true)
    expect(isReaderAtTimelineEnd(scrollerWith(2170))).toBe(true)
    expect(isReaderAtTimelineEnd(scrollerWith(2120))).toBe(true)
    expect(isReaderAtTimelineEnd(scrollerWith(2119))).toBe(false)
    expect(isReaderAtTimelineEnd(scrollerWith(1500))).toBe(false)
  })

  test("outside a chat timeline is not on its end", () => {
    expect(isReaderAtTimelineEnd(document.createElement("button"))).toBe(false)
  })
})

describe("reveal anchor", () => {
  const view = { viewTop: 0, viewBottom: 800 }

  test("holds the reader below the spacer", () => {
    expect(shouldHoldRevealAnchor({ ...view, spacerTop: -3000, firstMountedTop: -200 })).toBe(true)
  })

  test("holds the reader when a spacer above the viewport peeks into it", () => {
    expect(shouldHoldRevealAnchor({ ...view, spacerTop: -1200, firstMountedTop: 150 })).toBe(true)
  })

  test("lets a spacer that starts inside the viewport fill in place", () => {
    expect(shouldHoldRevealAnchor({ ...view, spacerTop: 300, firstMountedTop: 1500 })).toBe(false)
  })

  test("holds nothing when the spacer covers the whole viewport", () => {
    expect(shouldHoldRevealAnchor({ ...view, spacerTop: -500, firstMountedTop: 900 })).toBe(false)
  })
})
