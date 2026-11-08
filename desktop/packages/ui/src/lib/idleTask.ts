const IDLE_TIMEOUT_MS = 2_000
const FALLBACK_DELAY_MS = 1_000

/**
 * Runs `task` once the renderer is idle, or after IDLE_TIMEOUT_MS at the latest.
 * Falls back to a short timer where requestIdleCallback is unavailable.
 * Returns a cancel function suitable as a React effect cleanup.
 */
export function scheduleIdleTask(task: () => void): () => void {
  if (typeof window === "undefined") return () => {}
  if (typeof window.requestIdleCallback === "function") {
    const handle = window.requestIdleCallback(() => task(), { timeout: IDLE_TIMEOUT_MS })
    return () => window.cancelIdleCallback?.(handle)
  }
  const handle = window.setTimeout(task, FALLBACK_DELAY_MS)
  return () => window.clearTimeout(handle)
}
