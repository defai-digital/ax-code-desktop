import { normalizeProjectPath } from "@/lib/projectResolution"

export function buildEmbeddedSessionChatURL(sessionID: string, directory: string | null, readOnly = false): string {
  if (typeof window === "undefined") return ""
  const url = new URL(window.location.pathname, window.location.origin)
  url.searchParams.set("ocPanel", "session-chat")
  url.searchParams.set("sessionId", sessionID)
  if (readOnly) url.searchParams.set("readOnly", "1")
  const normalized = normalizeProjectPath(directory)
  if (normalized) url.searchParams.set("directory", normalized)
  return url.toString()
}

/** Frames can be mid-navigation: attempt the same-origin fast path inside the guard. */
function syncEmbedded(frame: HTMLIFrameElement, method: string, type: string, payload: unknown) {
  const target = frame.contentWindow
  if (!target) return
  try {
    const direct = (target as unknown as Record<string, unknown>)[method]
    if (typeof direct === "function") {
      direct(payload)
      return
    }
  } catch {
    /* Use the origin-bound message fallback during navigation. */
  }
  target.postMessage({ type, payload }, window.location.origin)
}
export const syncEmbeddedTheme = (frame: HTMLIFrameElement, payload: unknown) =>
  syncEmbedded(frame, "__openchamberApplyThemeSync", "openchamber:theme-sync", payload)
export const syncEmbeddedVisibility = (frame: HTMLIFrameElement, visible: boolean) =>
  syncEmbedded(frame, "__openchamberSetEmbeddedVisibility", "openchamber:embedded-visibility", { visible })
