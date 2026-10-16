const filteredRequestHeaders = new Set([
  "host",
  "connection",
  "content-length",
  "transfer-encoding",
  "keep-alive",
  "te",
  "trailer",
  "upgrade",
  "accept-encoding",
  // Browser CSRF header — must not be forwarded to ax-code because ax-code
  // validates Origin against its own server origin and will reject requests
  // from the sidecar's port with "origin mismatch".
  "origin",
])

const filteredResponseHeaders = new Set([
  "connection",
  "content-length",
  "transfer-encoding",
  "keep-alive",
  "te",
  "trailer",
  "upgrade",
  "www-authenticate",
  "content-encoding",
])

export const collectForwardProxyHeaders = (requestHeaders, authHeaders = {}) => {
  const headers = {}

  for (const [key, value] of Object.entries(requestHeaders || {})) {
    if (!value) continue
    const normalizedKey = key.toLowerCase()
    if (filteredRequestHeaders.has(normalizedKey)) continue
    headers[normalizedKey] = Array.isArray(value) ? value.join(", ") : String(value)
  }

  // A client that sends its own `authorization` reaches here under the normalized key,
  // and Headers init keeps `authorization` and `Authorization` as two separate entries and
  // joins their values: setting the credential under the capital key sent the runtime
  // "Bearer client, Basic server" and it answered 401. The normalized key replaces it.
  const runtimeAuthorization = authHeaders.Authorization ?? authHeaders.authorization
  if (runtimeAuthorization) {
    headers.authorization = runtimeAuthorization
  }

  return headers
}

export const shouldForwardProxyResponseHeader = (key) => {
  if (typeof key !== "string" || key.trim().length === 0) {
    return false
  }

  return !filteredResponseHeaders.has(key.toLowerCase())
}

export const applyForwardProxyResponseHeaders = (responseHeaders, response) => {
  if (!responseHeaders || typeof response?.setHeader !== "function") {
    return
  }

  for (const [key, value] of responseHeaders.entries()) {
    if (!shouldForwardProxyResponseHeader(key)) {
      continue
    }
    response.setHeader(key, value)
  }
}
