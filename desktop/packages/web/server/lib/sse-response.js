// Helpers for the server-sent-event responses this server writes itself (terminal output, UI notifications, the
// AX Code event proxy). Those responses stay open for hours and are written from timers and pty callbacks that do
// not know the response has ended.

/** Whether a write to this response can still reach the client. */
export const isSseResponseWritable = (res) => Boolean(res) && !res.writableEnded && !res.destroyed

/**
 * Give a long-lived SSE response an `error` listener and hand the error to `onError` (the route's teardown).
 *
 * A write after `end()` is not thrown: Node emits it as an `error` on the response on the next tick, so a
 * `try`/`catch` around the write does not see it, and with no listener it is an uncaught exception that takes
 * the whole server down. Checking `isSseResponseWritable` before each write avoids the common case; this
 * listener covers every write path at once, including the ones that race the end.
 */
export const guardSseResponse = (res, onError, { label = "SSE" } = {}) => {
  res.on("error", (error) => {
    console.warn(`[${label}] Response stream error:`, error?.code || error?.message || error)
    try {
      onError?.(error)
    } catch (teardownError) {
      console.warn(`[${label}] Teardown after a stream error failed:`, teardownError?.message || teardownError)
    }
  })
}
