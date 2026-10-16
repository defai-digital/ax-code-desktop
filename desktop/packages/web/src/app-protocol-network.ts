const APP_PROTOCOL_PAGE_ORIGIN = "app://ax-code"

const LOOPBACK_API_PREFIXES = ["/api", "/health", "/global", "/dre-graph", "/run-report", "/graph", "/auth"]

export const isAppProtocolPageOrigin = (origin: string): boolean => origin === APP_PROTOCOL_PAGE_ORIGIN

const isLoopbackApiPath = (pathname: string): boolean =>
  LOOPBACK_API_PREFIXES.some((prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`))

export const rewriteAppProtocolNetworkUrl = (
  input: string,
  options: { pageOrigin: string; apiOrigin: string },
): string => {
  const pageOrigin = options.pageOrigin.replace(/\/+$/, "")
  const apiOrigin = options.apiOrigin.replace(/\/+$/, "")
  if (!isAppProtocolPageOrigin(pageOrigin) || !apiOrigin) return input

  const raw = typeof input === "string" ? input.trim() : ""
  if (!raw) return input

  if (raw.startsWith("/")) {
    // Normalize before the prefix test, the way the absolute branch does through `new URL`: else a path like
    // "/api/../assets/index.js" passes on its `api/` prefix and then resolves to an asset path that the app://
    // protocol handler owns, not the loopback server.
    let pathname = "/"
    try {
      pathname = new URL(raw, pageOrigin).pathname
    } catch {
      return input
    }
    if (!isLoopbackApiPath(pathname)) return input
    return `${apiOrigin}${raw}`
  }

  try {
    const parsed = new URL(raw, `${pageOrigin}/`)
    const appHost = new URL(pageOrigin).hostname
    // The UI derives its socket URLs from the page — `normalizeWebSocketPath` builds
    // `ws://${window.location.host}<path>` — so on the packaged page they arrive as `ws://<app host>/…`, and the
    // scheme is never `app:`. Matching the app host under the socket schemes is what lets this reach the input
    // it exists for; the loopback path check below still bounds what may be rewritten.
    const isAppOrigin = parsed.hostname === appHost && ["app:", "ws:", "wss:"].includes(parsed.protocol)
    if (!isAppOrigin && parsed.origin !== pageOrigin) return input
    if (!isLoopbackApiPath(parsed.pathname)) return input
    return `${apiOrigin}${parsed.pathname}${parsed.search}${parsed.hash}`
  } catch {
    return input
  }
}

export const rewriteAppProtocolWebSocketUrl = (
  input: string,
  options: { pageOrigin: string; apiOrigin: string },
): string => {
  const rewritten = rewriteAppProtocolNetworkUrl(input, options)
  if (rewritten === input) return input
  try {
    const parsed = new URL(rewritten)
    if (parsed.protocol === "http:") parsed.protocol = "ws:"
    if (parsed.protocol === "https:") parsed.protocol = "wss:"
    return parsed.toString()
  } catch {
    return rewritten
  }
}

export const installAppProtocolNetworkRewrites = (options: { pageOrigin: string; apiOrigin?: string }): void => {
  const apiOrigin = typeof options.apiOrigin === "string" ? options.apiOrigin.trim() : ""
  if (!isAppProtocolPageOrigin(options.pageOrigin) || !apiOrigin) return
  if (typeof window === "undefined") return

  // HTTP fetch/EventSource stay on app:// so the custom protocol can proxy them
  // same-origin. WebSockets cannot use protocol.handle, so only those rewrite
  // to the loopback server.
  const rewriteOptions = { pageOrigin: options.pageOrigin, apiOrigin }
  const OriginalWebSocket = window.WebSocket
  if (typeof OriginalWebSocket !== "function") return
  window.WebSocket = class extends OriginalWebSocket {
    constructor(url: string | URL, protocols?: string | string[]) {
      super(rewriteAppProtocolWebSocketUrl(String(url), rewriteOptions), protocols)
    }
  } as typeof WebSocket
}
