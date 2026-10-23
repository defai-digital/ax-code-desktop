import React, { act } from "react"
import { createRoot, type Root } from "react-dom/client"
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest"

import { useAutoOnceSeconds } from "./useAutoOnceSeconds"

let latest: number | null = null
const Harness: React.FC<{ at?: number; id: string }> = ({ at, id }) => {
  latest = useAutoOnceSeconds(at, id)
  return null
}

describe("useAutoOnceSeconds", () => {
  let container: HTMLDivElement
  let root: Root
  beforeEach(() => {
    globalThis.IS_REACT_ACT_ENVIRONMENT = true
    vi.useFakeTimers()
    vi.setSystemTime(new Date("2026-10-23T00:00:00Z"))
    latest = null
    container = document.createElement("div")
    document.body.appendChild(container)
    root = createRoot(container)
  })
  afterEach(() => {
    act(() => root.unmount())
    container.remove()
    vi.useRealTimers()
  })

  test("is null when the runtime stamped no deadline", () => {
    act(() => root.render(<Harness id="a" />))
    expect(latest).toBeNull()
  })

  test("counts down each second and stops at zero without going negative", () => {
    act(() => root.render(<Harness id="a" at={Date.now() + 3_000} />))
    expect(latest).toBe(3)
    act(() => void vi.advanceTimersByTime(1_000))
    expect(latest).toBe(2)
    act(() => void vi.advanceTimersByTime(5_000))
    expect(latest).toBe(0)
  })

  test("a deadline added by a re-published ask starts the countdown, and removing it stops it", () => {
    act(() => root.render(<Harness id="a" />))
    expect(latest).toBeNull()
    act(() => root.render(<Harness id="a" at={Date.now() + 15_000} />))
    expect(latest).toBe(15)
    act(() => root.render(<Harness id="a" />))
    expect(latest).toBeNull()
    act(() => void vi.advanceTimersByTime(3_000))
    expect(latest).toBeNull()
  })

  test("a different request restarts from its own deadline", () => {
    act(() => root.render(<Harness id="a" at={Date.now() + 10_000} />))
    act(() => void vi.advanceTimersByTime(4_000))
    expect(latest).toBe(6)
    act(() => root.render(<Harness id="b" at={Date.now() + 15_000} />))
    expect(latest).toBe(15)
  })
})
