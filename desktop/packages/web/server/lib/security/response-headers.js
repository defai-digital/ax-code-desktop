import { getAppDocumentScriptHashes } from "./document-script-hashes.js"

const PREVIEW_PROXY_PREFIX = "/api/preview/proxy"
const DASHBOARD_PROXY_PREFIXES = ["/dre-graph", "/run-report", "/graph"]
export const PACKAGED_RENDERER_ORIGIN = "app://ax-code"

const getRequestPathname = (req) => {
  const pathname = req?.path || req?.originalUrl || req?.url || ""
  return pathname.split("?")[0]
}

export const isPreviewProxyRequest = (req) => {
  const pathname = getRequestPathname(req)
  return pathname === PREVIEW_PROXY_PREFIX || pathname.startsWith(`${PREVIEW_PROXY_PREFIX}/`)
}

export const isDashboardProxyRequest = (req) => {
  const pathname = getRequestPathname(req)
  return DASHBOARD_PROXY_PREFIXES.some((prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`))
}

export const applyPackagedRendererCorsHeaders = (req, res) => {
  const origin = typeof req?.headers?.origin === "string" ? req.headers.origin.trim() : ""
  if (origin !== PACKAGED_RENDERER_ORIGIN) return false
  res.setHeader("Access-Control-Allow-Origin", PACKAGED_RENDERER_ORIGIN)
  res.setHeader("Access-Control-Allow-Credentials", "true")
  res.setHeader(
    "Access-Control-Allow-Headers",
    // Last-Event-ID: the SSE transport sends it on every reconnect; without it
    // the preflight fails and live updates stop after the first reconnect.
    "Content-Type, Accept, Authorization, Cache-Control, Last-Event-ID, x-ax-code-directory, x-opencode-directory",
  )
  res.setHeader("Access-Control-Allow-Methods", "GET, HEAD, POST, PUT, PATCH, DELETE, OPTIONS")
  res.setHeader("Vary", "Origin")
  return true
}

export const applySecurityHeaders = (req, res) => {
  res.setHeader("X-Content-Type-Options", "nosniff")
  if (!isPreviewProxyRequest(req) && !isDashboardProxyRequest(req)) {
    res.setHeader("X-Frame-Options", "DENY")
  }
  res.setHeader("Referrer-Policy", "no-referrer")
  res.setHeader("X-XSS-Protection", "0")
  res.setHeader("Content-Security-Policy", buildWebServerCsp(req))
}

// img-src allows https://models.dev for provider logo fallbacks
// (packages/ui/src/hooks/useProviderLogo.ts).
const CSP_COMMON_TAIL =
  "style-src 'self' 'unsafe-inline'; img-src 'self' data: blob: https://models.dev; font-src 'self' data:; connect-src 'self' ws: wss: http: https:;"

// The app document runs without JavaScript eval, matching the packaged app://
// policy; 'wasm-unsafe-eval' keeps the terminal's WebAssembly renderer
// (ADR-018). Its inline scripts are allowed only by the SHA-256 hashes of the
// document being served, so it needs no 'unsafe-inline'. Preview and dashboard
// proxy responses render pages Desktop does not author (a user's dev server,
// runtime reports), so they keep the previous allowance; the preview proxy
// separately rewrites upstream policies.
export const buildWebServerCsp = (req, resolveScriptHashes = getAppDocumentScriptHashes) => {
  const proxied = isPreviewProxyRequest(req) || isDashboardProxyRequest(req)
  if (proxied) {
    return `default-src 'self'; script-src 'self' 'unsafe-inline' 'unsafe-eval'; ${CSP_COMMON_TAIL}`
  }
  const resolved = typeof resolveScriptHashes === "function" ? resolveScriptHashes(getRequestPathname(req)) : []
  const hashes = (Array.isArray(resolved) ? resolved : []).filter(
    (value) => typeof value === "string" && /^'sha256-[A-Za-z0-9+/=]+'$/.test(value),
  )
  const scriptSrc = ["script-src 'self' 'wasm-unsafe-eval'", ...hashes].join(" ")
  return `default-src 'self'; ${scriptSrc}; ${CSP_COMMON_TAIL}`
}
