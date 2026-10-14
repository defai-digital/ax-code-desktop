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

  const Probe = () => {
    const follow = useChatAutoFollow({
      currentSessionId: "session-a",
      sessionMessageCount: 2,
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
})
