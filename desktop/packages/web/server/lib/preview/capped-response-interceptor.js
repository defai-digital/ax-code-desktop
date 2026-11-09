import zlib from "zlib"

const decoderFor = (contentEncoding) => {
  switch (String(contentEncoding || "").toLowerCase()) {
    case "gzip":
      return zlib.createGunzip()
    case "br":
      return zlib.createBrotliDecompress()
    case "deflate":
      return zlib.createInflate()
    default:
      return null
  }
}

const copyUpstreamHeaders = (proxyRes, res) => {
  res.statusCode = proxyRes.statusCode
  if (proxyRes.statusMessage !== undefined) res.statusMessage = proxyRes.statusMessage
  for (const [key, value] of Object.entries(proxyRes.headers || {})) {
    // The body is sent decoded and with its own length.
    if (key === "content-encoding" || key === "transfer-encoding" || key === "content-length") continue
    res.setHeader(key, value)
  }
}

const fail = (res, statusCode, message) => {
  if (res.writableEnded) return
  if (!res.headersSent) {
    // A rewrite that threw ran after the upstream headers were copied; none of them (Location, CSP,
    // cookies) belong on the refusal.
    for (const name of res.getHeaderNames?.() ?? []) res.removeHeader(name)
    res.statusCode = statusCode
    res.setHeader("content-type", "text/plain; charset=utf-8")
    res.setHeader("x-content-type-options", "nosniff")
    res.setHeader("cache-control", "no-store")
  }
  res.end(message)
}

/**
 * Buffers an upstream body for `interceptor` to rewrite, as http-proxy-middleware's
 * `responseInterceptor` does, but with a byte cap. The library's version holds the
 * whole body with no limit (re-concatenating it on every chunk) and sends nothing
 * until the upstream ends. An endless or huge HTML/CSS/JS response therefore grew
 * the server's memory and never answered. Past `maxBytes` (decoded), the upstream
 * is dropped and the client gets a 502.
 */
export const createCappedResponseInterceptor = (interceptor, { maxBytes }) =>
  function cappedResponseInterceptor(proxyRes, req, res) {
    const decoder = decoderFor(proxyRes.headers?.["content-encoding"])
    const source = decoder ? proxyRes.pipe(decoder) : proxyRes
    const chunks = []
    let bytes = 0
    let settled = false

    const stop = (statusCode, message) => {
      if (settled) return
      settled = true
      chunks.length = 0
      proxyRes.destroy()
      decoder?.destroy()
      fail(res, statusCode, message)
    }

    source.on("data", (chunk) => {
      if (settled) return
      bytes += chunk.length
      if (bytes > maxBytes) {
        stop(502, "Preview response is too large to proxy")
        return
      }
      chunks.push(chunk)
    })
    source.on("error", () => stop(502, "Preview upstream response failed"))
    // A client that leaves mid-buffer must release the upstream rather than keep reading it to the end.
    res.on?.("close", () => {
      if (settled || res.writableEnded) return
      settled = true
      chunks.length = 0
      proxyRes.destroy()
      decoder?.destroy()
    })
    if (decoder) proxyRes.on("error", () => stop(502, "Preview upstream response failed"))
    // An upstream that drops the connection mid-body may emit no error, and a decoder would then wait
    // forever. `complete` is false on an incoming message closed before its body ended.
    proxyRes.on("close", () => {
      if (!settled && proxyRes.complete === false) stop(502, "Preview upstream response failed")
    })
    source.on("end", async () => {
      if (settled) return
      settled = true
      const body = Buffer.concat(chunks)
      chunks.length = 0
      try {
        copyUpstreamHeaders(proxyRes, res)
        const output = Buffer.from(await interceptor(body, proxyRes, req, res))
        if (res.writableEnded) return
        // A HEAD answer and a 204/304 carry no body (RFC 9110): the rewrite of their empty one would add the
        // bridge script and announce its length, which for HEAD misstates the resource and for 204 is invalid.
        const status = res.statusCode
        if (String(req?.method || "").toUpperCase() === "HEAD" || status === 204 || status === 304) {
          const upstreamLength = proxyRes.headers?.["content-length"]
          if (upstreamLength !== undefined && String(req?.method || "").toUpperCase() === "HEAD" && !decoder) {
            res.setHeader("content-length", upstreamLength)
          }
          res.end()
          return
        }
        res.setHeader("content-length", output.length)
        res.end(output)
      } catch (error) {
        console.error("[preview-proxy] response rewrite failed:", error)
        fail(res, 502, "Preview response rewrite failed")
      }
    })
  }
