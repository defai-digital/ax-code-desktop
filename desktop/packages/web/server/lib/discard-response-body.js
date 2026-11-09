// Releases an unread fetch response body so its connection returns to the pool. `cancel()` rejects when the
// body has already errored (a timeout fired after the headers, the peer reset), and the server has no
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
