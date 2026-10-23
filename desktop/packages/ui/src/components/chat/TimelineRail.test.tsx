import React, { act } from "react"
import { createRoot, type Root } from "react-dom/client"
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest"

vi.doMock("@/lib/i18n", () => ({
  useI18n: () => ({
    formatLocale: "en",
    t: (key: string, params?: Record<string, string | number>) =>
      params ? `${key}:${Object.values(params).join("|")}` : key,
  }),
}))

const { TimelineRail } = await import("./TimelineRail")

const turns = Array.from({ length: 4 }, (_, index) => ({
  id: `turn-${index}`,
  created: Date.UTC(2026, 9, 22, 7, 15 + index),
  preview: `prompt ${index}`,
}))

let container: HTMLDivElement
let root: Root
let width = 900
let height = 400

class FakeResizeObserver {
  constructor(private readonly callback: () => void) {}
  observe() {
    this.callback()
  }
  disconnect() {}
}

beforeEach(() => {
  width = 900
  height = 400
  vi.stubGlobal("ResizeObserver", FakeResizeObserver)
  vi.spyOn(HTMLElement.prototype, "clientWidth", "get").mockImplementation(() => width)
  vi.spyOn(HTMLElement.prototype, "clientHeight", "get").mockImplementation(() => height)
  container = document.createElement("div")
  document.body.appendChild(container)
  scrollRef.current = null
  root = createRoot(container)
})

afterEach(() => {
  act(() => root.unmount())
  container.remove()
  vi.restoreAllMocks()
  vi.unstubAllGlobals()
})

const scrollRef = { current: null as HTMLDivElement | null }

const render = (props: Partial<React.ComponentProps<typeof TimelineRail>> = {}) => {
  const onJumpToTurn = vi.fn()
  act(() => {
    root.render(
      <TimelineRail
        turns={turns}
        scrollRef={scrollRef}
        activeTurnId="turn-1"
        atBottom={false}
        onJumpToTurn={onJumpToTurn}
        {...props}
      />,
    )
  })
  return { onJumpToTurn }
}

const ticks = () =>
  Array.from(
    container.querySelectorAll<HTMLButtonElement>("button[aria-current], button[aria-label^='chat.timelineRail.turn']"),
  )

describe("TimelineRail", () => {
  test("draws one tick per turn and marks the active one", () => {
    render()
    expect(container.querySelectorAll("button[aria-label^='chat.timelineRail.turn']")).toHaveLength(4)
    expect(container.querySelector("[aria-current='location']")?.getAttribute("aria-label")).toContain("2|4")
  })

  test("marks the last turn active when the transcript is at the bottom", () => {
    render({ atBottom: true })
    expect(container.querySelector("[aria-current='location']")?.getAttribute("aria-label")).toContain("4|4")
  })

  test("jumps to the clicked turn", () => {
    const { onJumpToTurn } = render()
    act(() => ticks()[2]?.click())
    expect(onJumpToTurn).toHaveBeenCalledWith("turn-2")
  })

  test("steps with the arrows and disables the one that has nowhere to go", () => {
    const { onJumpToTurn } = render({ activeTurnId: "turn-0" })
    const previous = container.querySelector<HTMLButtonElement>("button[aria-label='chat.timelineRail.previous']")
    const next = container.querySelector<HTMLButtonElement>("button[aria-label='chat.timelineRail.next']")
    expect(previous?.disabled).toBe(true)
    act(() => next?.click())
    expect(onJumpToTurn).toHaveBeenCalledWith("turn-1")
  })

  test("steps from the rail's reached turn when the transcript reports a later visible turn", () => {
    const scroller = document.createElement("div")
    scroller.getBoundingClientRect = () => ({ top: 0 }) as DOMRect
    for (const [index, top] of [-400, 2, 180, 360].entries()) {
      const node = document.createElement("div")
      node.dataset.turnId = turns[index].id
      node.getBoundingClientRect = () => ({ top }) as DOMRect
      scroller.appendChild(node)
    }
    scrollRef.current = scroller
    const { onJumpToTurn } = render({ activeTurnId: "turn-2" })
    const next = container.querySelector<HTMLButtonElement>("button[aria-label='chat.timelineRail.next']")
    act(() => next?.click())
    expect(onJumpToTurn).toHaveBeenCalledWith("turn-2")
  })

  test("remeasures when a different session has the same turn count", () => {
    const scroller = document.createElement("div")
    scroller.getBoundingClientRect = () => ({ top: 0 }) as DOMRect
    const node = document.createElement("div")
    node.dataset.turnId = "turn-1"
    node.getBoundingClientRect = () => ({ top: 2 }) as DOMRect
    scroller.appendChild(node)
    scrollRef.current = scroller
    render()
    const nextTurns = turns.map((turn) => ({ ...turn, id: `next-${turn.id}` }))
    node.dataset.turnId = "next-turn-1"
    render({ turns: nextTurns, activeTurnId: "next-turn-1" })
    expect(container.querySelector("[aria-current='location']")?.getAttribute("aria-label")).toContain("2|4")
  })

  test("shows the prompt preview while a tick is hovered", () => {
    render()
    act(() => {
      ticks()[1]?.dispatchEvent(new MouseEvent("mouseover", { bubbles: true }))
    })
    expect(container.textContent).toContain("prompt 1")
  })

  test("stays out of the way when the transcript is narrow", () => {
    width = 400
    render()
    expect(container.querySelector("[data-testid='chat-timeline-rail']")).toBeNull()
  })

  test("follows the last turn whose top has reached the viewport top, not the most visible one", () => {
    const scroller = document.createElement("div")
    scroller.getBoundingClientRect = () => ({ top: 0 }) as DOMRect
    // Turn 2 was just jumped to and sits at the viewport top; turn 3 is fully visible below it.
    const tops: Record<string, number> = { "turn-0": -400, "turn-1": -200, "turn-2": 2, "turn-3": 180 }
    for (const [id, top] of Object.entries(tops)) {
      const node = document.createElement("div")
      node.dataset.turnId = id
      node.getBoundingClientRect = () => ({ top }) as DOMRect
      scroller.appendChild(node)
    }
    scrollRef.current = scroller
    render({ activeTurnId: "turn-3" })
    expect(container.querySelector("[aria-current='location']")?.getAttribute("aria-label")).toContain("3|4")
  })
})
