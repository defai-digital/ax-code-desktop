/**
 * Terminal error handler for the web server.
 *
 * Express 5's built-in final handler echoes `err.stack` whenever NODE_ENV is not
 * "production", and this server never sets NODE_ENV, so every `next(err)` — and
 * every rejected async handler — answered with a full stack trace. It also
 * ignored the status a handler attached (an over-limit upload is a 413, not a
 * 500). This handler keeps the status, logs the detail server-side, and returns
 * a stable message.
 */
export const createFinalErrorHandler = ({ logger = console } = {}) => (err, req, res, next) => {
  const status =
    typeof err?.status === "number"
      ? err.status
      : typeof err?.statusCode === "number"
        ? err.statusCode
        : 500
  const safeStatus = status >= 400 && status < 600 ? status : 500
  const detail = err instanceof Error ? err.message : String(err ?? "unknown error")
  const route = typeof req?.originalUrl === "string" ? req.originalUrl : (req?.url ?? "")

  logger.error(`[server] ${req?.method ?? "?"} ${route} failed (${safeStatus}):`, err)

  if (res?.headersSent) {
    // The response already started; hand back to Express to close it.
    next(err)
    return
  }

  const message =
    safeStatus === 413
      ? "Request body too large"
      : safeStatus === 400
        ? "Bad request"
        : safeStatus === 404
          ? "Not found"
          : "Internal server error"

  res.status(safeStatus).json({ error: message, detail: undefined, stack: undefined })
}
