import { afterEach, describe, expect, test, vi } from "vitest"
import { createCoalescedNotify } from "./coalescedNotify"

describe("createCoalescedNotify", () => {
  afterEach(() => vi.useRealTimers())

  test("publishes once per fixed window during a continuous stream, including its final state", () => {
    vi.useFakeTimers()
    let state = 0
    const published: number[] = []
    const notify = createCoalescedNotify(() => published.push(state), setTimeout, clearTimeout)
    for (let index = 0; index < 30; index += 1) {
      state += 1
      notify.notify()
      vi.advanceTimersByTime(10)
    }
    expect(published).toEqual([10, 20, 30])
    expect(published.at(-1)).toBe(state)
    expect(vi.getTimerCount()).toBe(0)

    vi.advanceTimersByTime(1000)
    state = 31
    notify.notify()
    vi.advanceTimersByTime(99)
    expect(published).toHaveLength(3)
    vi.advanceTimersByTime(1)
    expect(published).toEqual([10, 20, 30, 31])
  })

  test("flushes authoritative updates immediately and cancels work on disposal", () => {
    vi.useFakeTimers()
    const published = vi.fn()
    const notify = createCoalescedNotify(published, setTimeout, clearTimeout)
    notify.notify()
    notify.flush()
    expect(published).toHaveBeenCalledTimes(1)
    vi.advanceTimersByTime(100)
    expect(published).toHaveBeenCalledTimes(1)
    notify.notify()
    notify.dispose()
    vi.advanceTimersByTime(100)
    expect(published).toHaveBeenCalledTimes(1)
  })
})
