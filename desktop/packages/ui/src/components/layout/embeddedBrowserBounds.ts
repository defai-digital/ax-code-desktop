/** How often a mounted pane may re-measure itself while the document keeps mutating. */
export const BOUNDS_MUTATION_INTERVAL_MS = 150

export type CancelTimer = () => void

/**
 * Runs `run` at most once per interval for a burst of requests. `request` only schedules, so a
 * mutation observer can call it on every DOM change without reading layout. The first request is
 * due immediately; further requests inside the window share one trailing run, so a change made
 * mid-window (a dialog opening, a panel moved without a resize) is still seen within `intervalMs`.
 */
export function createThrottledRun(options: {
  intervalMs: number
  now: () => number
  schedule: (run: () => void, delayMs: number) => CancelTimer
  run: () => void
}): {
  request: () => void
  dispose: () => void
} {
  let disposed = false
  let cancel: CancelTimer | null = null
  let lastRun = Number.NEGATIVE_INFINITY

  const request = () => {
    if (disposed || cancel) return
    const elapsed = options.now() - lastRun
    const delay = elapsed >= options.intervalMs ? 0 : options.intervalMs - elapsed
    cancel = options.schedule(() => {
      cancel = null
      if (disposed) return
      lastRun = options.now()
      options.run()
    }, delay)
  }

  const dispose = () => {
    disposed = true
    cancel?.()
    cancel = null
  }

  return { request, dispose }
}
