export type PreviewConsoleEvent = {
  id: number
  level: "log" | "info" | "warn" | "error" | "debug" | "resource" | "runtime"
  message: string
  details?: string
  ts: number
}

export type PreviewConsoleFilter = "all" | "errors" | "warnings" | "logs"

export type PreviewBridgeMessage = {
  source?: string
  version?: number
  type?: string
  level?: PreviewConsoleEvent["level"]
  args?: unknown[]
  message?: unknown
  stack?: unknown
  filename?: unknown
  line?: unknown
  column?: unknown
  tag?: unknown
  url?: unknown
  outerHTML?: unknown
  title?: unknown
  ts?: unknown
  target?: unknown
  navigation?: unknown
}

export const PREVIEW_CONSOLE_EVENT_LIMIT = 200

export const getContextPanelPreviewConsoleFilterMatch = (
  event: PreviewConsoleEvent,
  filter: PreviewConsoleFilter,
): boolean => {
  if (filter === "all") return true
  if (filter === "errors") return event.level === "error" || event.level === "runtime" || event.level === "resource"
  if (filter === "warnings") return event.level === "warn"
  return event.level === "log" || event.level === "info" || event.level === "debug"
}

export const normalizeContextPanelBrowserUrl = (value: string): string => {
  const trimmed = value.trim()
  if (!trimmed) return "about:blank"
  try {
    const parsed = new URL(trimmed.includes("://") ? trimmed : `https://${trimmed}`)
    if (parsed.protocol !== "http:" && parsed.protocol !== "https:") return "about:blank"
    return parsed.toString()
  } catch {
    return "about:blank"
  }
}

/**
 * The proxy base path to load a URL through, or "" when the resolved state does not belong to it.
 *
 * The state is resolved asynchronously for the URL that was current when the request went out, and it
 * survives a change of URL for one commit. Pairing an old base path with a new URL's path and query sent
 * that path — query string, tokens included — through the *previous* origin's proxy, so the key the state
 * was resolved for has to match the URL being loaded.
 */
export const resolvePreviewProxyBasePath = (
  state: { status: "idle" | "loading" | "ready" | "error"; targetKey?: string; proxyBasePath?: string },
  targetKey: string,
): string => {
  if (state.status !== "ready" || !state.proxyBasePath) return ""
  return state.targetKey === targetKey ? state.proxyBasePath : ""
}
