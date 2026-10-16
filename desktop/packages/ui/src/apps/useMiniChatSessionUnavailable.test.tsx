import React, { act } from "react"
import { createRoot, type Root } from "react-dom/client"
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest"

type SessionStub = { id: string; time?: { updated?: number } }

const { liveSessions, currentSessionId } = vi.hoisted(() => ({
  liveSessions: { current: [] as SessionStub[] },
  currentSessionId: { current: null as string | null },
}))

vi.mock("@/sync/sync-context", () => ({ useSessions: () => liveSessions.current }))
vi.mock("@/sync/session-ui-store", () => ({
  useSessionUIStore: (selector: (state: { currentSessionId: string | null }) => unknown) =>
    selector({ currentSessionId: currentSessionId.current }),
}))

const { useMiniChatSessionUnavailable } = await import("./useMiniChatSessionUnavailable")

// Declared once so a re-render updates the same instance instead of remounting the hook: remounting
// would re-anchor the deadline and hide what this test is about.
const Probe = ({ sessionId }: { sessionId: string | null }) => (
  <div data-unavailable={String(useMiniChatSessionUnavailable({ mode: "session", sessionId }))} />
)

describe("useMiniChatSessionUnavailable", () => {
  let container: HTMLDivElement
  let root: Root

  const renderProbe = (sessionId: string | null) => {
    act(() => {
      root.render(<Probe sessionId={sessionId} />)
    })
  }

  const unavailable = () => container.querySelector("[data-unavailable]")?.getAttribute("data-unavailable") === "true"

  const advance = (ms: number) => {
    act(() => {
      vi.advanceTimersByTime(ms)
    })
  }

  beforeEach(() => {
    ;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true
    vi.useFakeTimers()
    container = document.createElement("div")
    document.body.appendChild(container)
    root = createRoot(container)
    liveSessions.current = []
    currentSessionId.current = null
  })

  afterEach(() => {
    act(() => root.unmount())
    container.remove()
    vi.useRealTimers()
    vi.restoreAllMocks()
  })

  test("a session that never appears becomes unavailable", () => {
    renderProbe("missing")
    expect(unavailable()).toBe(false)

    advance(5_000)

    expect(unavailable()).toBe(true)
  })

  // The session list gets a new identity on every session event, so this effect re-runs while a sibling
  // session streams. Restarting the timer there left the window on a chat whose session was gone.
  test("unrelated session updates do not postpone the deadline", () => {
    renderProbe("missing")

    for (let tick = 0; tick < 6; tick += 1) {
      advance(1_000)
      liveSessions.current = [{ id: "sibling", time: { updated: tick } }]
      renderProbe("missing")
    }

    expect(unavailable()).toBe(true)
  })

  test("a session that appears in time is not unavailable", () => {
    renderProbe("wanted")

    advance(3_000)
    liveSessions.current = [{ id: "wanted" }]
    renderProbe("wanted")
    advance(10_000)

    expect(unavailable()).toBe(false)
  })

  test("waiting on the session the window already shows is not unavailable", () => {
    currentSessionId.current = "wanted"
    renderProbe("wanted")

    advance(10_000)

    expect(unavailable()).toBe(false)
  })
})
