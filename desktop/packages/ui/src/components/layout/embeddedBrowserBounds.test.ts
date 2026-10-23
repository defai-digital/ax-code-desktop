import { expect, test } from "vitest"
import { BOUNDS_MUTATION_INTERVAL_MS, createThrottledRun } from "./embeddedBrowserBounds"

const clock = () => {
  let now = 0
  const queue: { at: number; run: () => void; cancelled: boolean }[] = []
  const schedule = (run: () => void, delayMs: number) => {
    const entry = { at: now + delayMs, run, cancelled: false }
    queue.push(entry)
    return () => {
      entry.cancelled = true
    }
  }
  const flush = (target: number) => {
    now = target
    const due = queue.filter((entry) => !entry.cancelled && entry.at <= now).sort((a, b) => a.at - b.at)
    for (const entry of due) entry.cancelled = true
    for (const entry of due) entry.run()
  }
  return { schedule, flush, now: () => now }
}

const throttle = (time: ReturnType<typeof clock>, run: () => void) =>
  createThrottledRun({ intervalMs: BOUNDS_MUTATION_INTERVAL_MS, now: time.now, schedule: time.schedule, run })

test("a request never runs synchronously, and a burst runs once per interval", () => {
  const time = clock()
  let runs = 0
  const watch = throttle(time, () => (runs += 1))

  watch.request()
  watch.request()
  expect(runs).toBe(0)

  time.flush(0)
  expect(runs).toBe(1)

  watch.request()
  watch.request()
  time.flush(BOUNDS_MUTATION_INTERVAL_MS - 1)
  expect(runs).toBe(1)
  time.flush(BOUNDS_MUTATION_INTERVAL_MS)
  expect(runs).toBe(2)
})

test("a request after a quiet interval is due immediately", () => {
  const time = clock()
  let runs = 0
  const watch = throttle(time, () => (runs += 1))
  watch.request()
  time.flush(0)

  time.flush(BOUNDS_MUTATION_INTERVAL_MS * 3)
  watch.request()
  time.flush(BOUNDS_MUTATION_INTERVAL_MS * 3)
  expect(runs).toBe(2)
})

test("dispose cancels the pending run and ignores later requests", () => {
  const time = clock()
  let runs = 0
  const watch = throttle(time, () => (runs += 1))
  watch.request()
  watch.dispose()
  time.flush(BOUNDS_MUTATION_INTERVAL_MS)
  watch.request()
  time.flush(BOUNDS_MUTATION_INTERVAL_MS * 2)
  expect(runs).toBe(0)
})
