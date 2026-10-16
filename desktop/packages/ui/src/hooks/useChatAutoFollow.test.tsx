import React from "react"
import { createRoot } from "react-dom/client"
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest"
import { useUIStore } from "@/stores/useUIStore"
import { useChatAutoFollow } from "./useChatAutoFollow"

const uiSnapshot = useUIStore.getState()

describe("useChatAutoFollow collapsed activity", () => {
  let container: HTMLDivElement
  let root: ReturnType<typeof createRoot>
  let result: ReturnType<typeof useChatAutoFollow> | null = null
  let frames: Map<number, FrameRequestCallback>
  let nextFrameId: number
  let sessionIsWorking = true
  let currentSessionId = "session-a"
  let sessionMessageCount = 2

  const Probe = () => {
    const follow = useChatAutoFollow({
      currentSessionId,
      sessionMessageCount,
      sessionIsWorking,
      isMobile: false,
    })
    result = follow
    return React.createElement(
      "div",
      { ref: follow.scrollRef },
      React.createElement("section", { "data-turn-id": "turn-a" }),
      React.createElement("section", { "data-turn-id": "turn-b" }),
    )
  }

  const render = () => {
    React.act(() => {
      root.render(React.createElement(Probe))
    })
  }

  const flushFrame = () => {
    const frame = frames.entries().next().value as [number, FrameRequestCallback] | undefined
    if (!frame) return false
    frames.delete(frame[0])
    React.act(() => {
      frame[1](0)
    })
    return true
  }

  const flushFrames = (limit = 120) => {
    for (let index = 0; index < limit && flushFrame(); index += 1) {
      // Drain the scheduled follow animation deterministically.
    }
  }

  const getElements = () => {
    const scrollContainer = container.firstElementChild as HTMLDivElement
    const turns = scrollContainer.querySelectorAll("section[data-turn-id]")
    return { scrollContainer, lastTurn: turns.item(turns.length - 1) as HTMLElement }
  }

  beforeEach(() => {
    ;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true
    frames = new Map()
    nextFrameId = 1
    vi.spyOn(window, "requestAnimationFrame").mockImplementation((callback) => {
      const id = nextFrameId++
      frames.set(id, callback)
      return id
    })
    vi.spyOn(window, "cancelAnimationFrame").mockImplementation((id) => {
      frames.delete(id)
    })
    container = document.createElement("div")
    document.body.appendChild(container)
    root = createRoot(container)
    result = null
    sessionIsWorking = true
    currentSessionId = "session-a"
    sessionMessageCount = 2
    useUIStore.setState({ activityRenderMode: "collapsed" })
  })

  afterEach(() => {
    React.act(() => {
      root.unmount()
    })
    container.remove()
    useUIStore.setState({ activityRenderMode: uiSnapshot.activityRenderMode })
    vi.restoreAllMocks()
  })

  const setLayout = (turnTop: number) => {
    const { scrollContainer, lastTurn } = getElements()
    Object.defineProperties(scrollContainer, {
      clientHeight: { configurable: true, value: 100 },
      scrollHeight: { configurable: true, value: 1000 },
    })
    scrollContainer.getBoundingClientRect = () => ({ top: 100 }) as DOMRect
    lastTurn.getBoundingClientRect = () => ({ top: 100 + turnTop - scrollContainer.scrollTop }) as DOMRect
    return scrollContainer
  }

  const clampToBottom = (scrollContainer: HTMLElement) => {
    vi.spyOn(performance, "now").mockReturnValue(performance.now() + 5000)
    scrollContainer.scrollTop = 900
    React.act(() => {
      scrollContainer.dispatchEvent(new Event("scroll"))
    })
  }

  const dispatchTouch = (target: HTMLElement, type: string, clientY: number) => {
    const event = new Event(type, { bubbles: true })
    Object.defineProperty(event, "touches", { value: { item: () => ({ clientY }) } })
    target.dispatchEvent(event)
  }

  test("stops at the last turn section top and releases the live follow", () => {
    render()
    const scrollContainer = setLayout(300)

    flushFrames()

    expect(result?.state).toBe("released")
    expect(scrollContainer.scrollTop).toBe(300)

    React.act(() => {
      scrollContainer.dispatchEvent(new Event("scroll"))
    })
    expect(result?.showScrollButton).toBe(true)
  })

  test("does not count a new session's messages against the previous session's baseline", () => {
    render()
    const scrollContainer = setLayout(300)
    flushFrames()
    expect(result?.state).toBe("released")
    expect(result?.unseenCount).toBe(0)

    // The reader opens another session whose viewport was already released earlier in
    // this run, so it restores released. Its history is not "new" for this reader.
    currentSessionId = "session-b"
    sessionMessageCount = 40
    React.act(() => {
      root.render(React.createElement(Probe))
    })
    flushFrames()

    expect(result?.state).toBe("released")
    expect(result?.unseenCount).toBe(0)

    // A message that arrives while this session is released still counts.
    sessionMessageCount = 41
    React.act(() => {
      root.render(React.createElement(Probe))
    })
    expect(result?.unseenCount).toBe(1)
    expect(scrollContainer.scrollTop).toBe(300)
  })

  test("does not stop again at a consumed section after the reader returns to bottom", () => {
    render()
    const scrollContainer = setLayout(300)
    flushFrames()

    React.act(() => {
      result?.goToBottom("smooth")
    })
    flushFrames()

    expect(result?.state).toBe("following")
    expect(scrollContainer.scrollTop).toBe(900)
  })

  test.each(["smooth", "instant"] as const)("reader navigation bypasses an unconsumed stop in %s mode", (mode) => {
    render()
    const scrollContainer = setLayout(300)
    flushFrame()

    React.act(() => {
      result?.releaseAutoFollow()
      result?.goToBottom(mode, { reason: "reader" })
    })
    flushFrames()

    expect(scrollContainer.scrollTop).toBe(900)
    expect(result?.state).toBe("following")

    React.act(() => {
      result?.releaseAutoFollow()
      scrollContainer.scrollTop = 0
      result?.goToBottom("smooth")
    })
    flushFrames()
    expect(scrollContainer.scrollTop).toBe(900)
    expect(result?.state).toBe("following")
  })

  test("reader navigation only consumes the turn present when clicked even if its node is reused", () => {
    render()
    const scrollContainer = setLayout(300)
    React.act(() => {
      result?.releaseAutoFollow()
      result?.goToBottom("smooth", { reason: "reader" })
    })
    getElements().lastTurn.dataset.turnId = "turn-c"
    setLayout(600)
    flushFrames()

    expect(scrollContainer.scrollTop).toBe(600)
    expect(result?.state).toBe("released")
  })

  test("reader navigation preserves a newer turn stop after a delayed render", () => {
    render()
    const scrollContainer = setLayout(300)
    React.act(() => {
      result?.releaseAutoFollow()
    })
    const turnId = getElements().lastTurn.dataset.turnId
    getElements().lastTurn.dataset.turnId = "turn-c"
    setLayout(600)
    React.act(() => {
      result?.goToBottom("smooth", { reason: "reader", turnId })
    })
    flushFrames()

    expect(scrollContainer.scrollTop).toBe(600)
    expect(result?.state).toBe("released")
  })

  test("sending a message preserves the new turn stop as the turn grows", () => {
    render()
    const scrollContainer = setLayout(300)
    flushFrames()
    getElements().lastTurn.dataset.turnId = "turn-c"
    setLayout(900)
    React.act(() => {
      result?.goToBottom("instant")
    })
    vi.spyOn(performance, "now").mockReturnValue(performance.now() + 1000)
    flushFrames()

    Object.defineProperty(scrollContainer, "scrollHeight", { configurable: true, value: 1500 })
    React.act(() => {
      result?.notifyContentChange()
    })
    flushFrames()

    expect(scrollContainer.scrollTop).toBe(900)
    expect(result?.state).toBe("released")
  })

  test("keeps following to the bottom when Activity is in summary mode", () => {
    useUIStore.setState({ activityRenderMode: "summary" })
    render()
    const scrollContainer = setLayout(300)

    flushFrames()

    expect(result?.state).toBe("following")
    expect(scrollContainer.scrollTop).toBe(900)
  })

  test("never stops while the session is idle, such as when a session opens onto a long turn", () => {
    sessionIsWorking = false
    render()
    const scrollContainer = setLayout(300)

    React.act(() => {
      result?.goToBottom("smooth")
    })
    flushFrames()

    expect(scrollContainer.scrollTop).toBe(900)
    expect(result?.state).toBe("following")
  })

  test("does not stop at a turn whose start was already above the viewport when the follow met it", () => {
    render()
    const scrollContainer = setLayout(300)
    scrollContainer.scrollTop = 400

    flushFrames()

    expect(scrollContainer.scrollTop).toBe(900)
    expect(result?.state).toBe("following")
  })

  test("follows a turn that still fits to the end without spending its stop", () => {
    render()
    const scrollContainer = setLayout(900)

    flushFrames()

    expect(scrollContainer.scrollTop).toBe(900)
    expect(result?.state).toBe("following")
  })

  test("snaps onto a stop a few pixels away instead of creeping toward it", () => {
    render()
    const scrollContainer = setLayout(300)
    // Browsers round scroll positions, so a lerp step under a pixel is lost;
    // the stop must still land and release rather than follow forever.
    let roundedTop = 296
    Object.defineProperty(scrollContainer, "scrollTop", {
      configurable: true,
      get: () => roundedTop,
      set: (value: number) => {
        roundedTop = Math.floor(value)
      },
    })

    flushFrames()

    expect(scrollContainer.scrollTop).toBe(300)
    expect(result?.state).toBe("released")
  })

  test("stays at the stop when a re-measure clamps the scroll position to the end", () => {
    render()
    const scrollContainer = setLayout(300)
    flushFrames()
    expect(result?.state).toBe("released")

    // The settled turn's row re-measures and the browser clamps to the end,
    // well after the follow's own writes.
    const later = performance.now() + 5000
    vi.spyOn(performance, "now").mockReturnValue(later)
    scrollContainer.scrollTop = 900
    React.act(() => {
      scrollContainer.dispatchEvent(new Event("scroll"))
    })
    expect(result?.state).toBe("released")

    // Once the reader scrolls themselves, reaching the end follows again.
    React.act(() => {
      scrollContainer.dispatchEvent(new WheelEvent("wheel", { deltaY: 40 }))
      scrollContainer.dispatchEvent(new Event("scroll"))
    })
    expect(result?.state).toBe("following")
  })

  test.each([
    { key: "c", ctrlKey: true },
    { key: "c", metaKey: true },
    { key: "PageDown", ctrlKey: true },
    { key: "End", metaKey: true },
    { key: "ArrowDown", altKey: true },
    { key: "a" },
  ])("keeps the follow stop hold for non-scroll input %j", (init) => {
    render()
    const scrollContainer = setLayout(300)
    flushFrames()

    React.act(() => {
      scrollContainer.dispatchEvent(new KeyboardEvent("keydown", { ...init, bubbles: true }))
    })
    clampToBottom(scrollContainer)

    expect(result?.state).toBe("released")
  })

  test.each(["input", "textarea", "contenteditable"])("keeps the follow stop hold for keys in %s", (kind) => {
    render()
    const scrollContainer = setLayout(300)
    flushFrames()
    const editable = document.createElement(kind === "contenteditable" ? "div" : kind)
    if (kind === "contenteditable") editable.setAttribute("contenteditable", "true")
    const target = kind === "contenteditable" ? editable.appendChild(document.createElement("span")) : editable
    scrollContainer.appendChild(editable)

    React.act(() => {
      target.dispatchEvent(new KeyboardEvent("keydown", { key: "ArrowUp", bubbles: true }))
    })
    clampToBottom(scrollContainer)

    expect(result?.state).toBe("released")
  })

  test.each(["PageUp", "PageDown", "Home", "End", "ArrowUp", "ArrowDown", " "])("ends the hold for outer scroll key %j", (key) => {
    render()
    const scrollContainer = setLayout(300)
    flushFrames()

    React.act(() => {
      scrollContainer.dispatchEvent(new KeyboardEvent("keydown", { key, bubbles: true }))
    })
    clampToBottom(scrollContainer)

    expect(result?.state).toBe("following")
  })

  test.each([
    { deltaY: -40, scrollTop: 50, held: true },
    { deltaY: 40, scrollTop: 50, held: true },
    { deltaY: -40, scrollTop: 0, held: false },
    { deltaY: 40, scrollTop: 200, held: false },
    { deltaY: 0, scrollTop: 50, held: true },
  ])("only ends the hold when nested wheel input reaches the timeline %j", ({ deltaY, scrollTop, held }) => {
    render()
    const scrollContainer = setLayout(300)
    flushFrames()
    const nested = document.createElement("div")
    nested.style.overflowY = "auto"
    Object.defineProperties(nested, {
      clientHeight: { value: 100 },
      scrollHeight: { value: 300 },
    })
    nested.scrollTop = scrollTop
    const target = nested.appendChild(document.createElement("code"))
    scrollContainer.appendChild(nested)

    React.act(() => {
      target.dispatchEvent(new WheelEvent("wheel", { deltaY, deltaX: 40, bubbles: true }))
    })
    clampToBottom(scrollContainer)

    expect(result?.state).toBe(held ? "released" : "following")
  })

  test("checks every nested ancestor for wheel consumption", () => {
    render()
    const scrollContainer = setLayout(300)
    flushFrames()
    const outer = document.createElement("div")
    const inner = outer.appendChild(document.createElement("div"))
    for (const nested of [outer, inner]) {
      nested.setAttribute("data-scrollable", "")
      Object.defineProperties(nested, {
        clientHeight: { value: 100 },
        scrollHeight: { value: 300 },
      })
    }
    outer.scrollTop = 50
    scrollContainer.appendChild(outer)

    React.act(() => {
      inner.dispatchEvent(new WheelEvent("wheel", { deltaY: -40, bubbles: true }))
    })
    clampToBottom(scrollContainer)

    expect(result?.state).toBe("released")
  })

  test.each([true, false])("only ends the hold for touch input outside a vertical nested scroller: %j", (vertical) => {
    render()
    const scrollContainer = setLayout(300)
    flushFrames()
    const nested = document.createElement("div")
    nested.style.overflow = "auto"
    Object.defineProperties(nested, {
      clientHeight: { value: 100 },
      scrollHeight: { value: vertical ? 300 : 100 },
      clientWidth: { value: 100 },
      scrollWidth: { value: 300 },
    })
    const target = nested.appendChild(document.createElement("code"))
    scrollContainer.appendChild(nested)

    React.act(() => {
      dispatchTouch(target, "touchstart", 100)
      dispatchTouch(target, "touchmove", 50)
    })
    clampToBottom(scrollContainer)

    expect(result?.state).toBe(vertical ? "released" : "following")
  })
})
