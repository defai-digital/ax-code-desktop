// Every quota provider issues exactly one HTTP request, and Node's fetch never aborts
// on its own: a hung upstream would wedge the caller's single-flight guard forever and
// the quota dropdown would spin until the app is reloaded. All provider calls go
// through this helper with a bounded timeout. A caller that already carries a signal
// keeps it.
export const QUOTA_FETCH_TIMEOUT_MS = 15_000

export const fetchWithQuotaTimeout = (url, options = {}) => {
  const signal = options.signal ?? AbortSignal.timeout(QUOTA_FETCH_TIMEOUT_MS)
  return fetch(url, { ...options, signal })
}

// Releases an unread response body so its connection returns to the pool. `cancel()` rejects when the
// body has already errored (the timeout fired after the headers, the peer reset), and the server has no
// unhandled-rejection handler, so a bare `response.body?.cancel()` could take the whole process down.
export const discardResponseBody = (response) => {
  const body = response?.body
  if (!body || typeof body.cancel !== "function") return
  try {
    void Promise.resolve(body.cancel()).catch(() => {})
  } catch {
    // A locked or already-released body has nothing left to cancel.
  }
}
