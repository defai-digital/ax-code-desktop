import type { I18nKey } from "@/lib/i18n"
import type { WebMcpBrowserSnapshot } from "@/stores/useWebMcpBrowserStore"

export type WebMcpTone = "default" | "success" | "warning" | "error"

export interface WebMcpSummary {
  tone: WebMcpTone
  /** Short state label, e.g. "Agent access on". */
  stateKey: I18nKey
  /** One-line detail, e.g. the origin and tool count or the actionable failure. */
  detailKey: I18nKey
  detailParams?: Record<string, string | number>
  /** Whether the surface should offer to open the project browser. */
  canOpen: boolean
}

type SummaryInput = Pick<
  WebMcpBrowserSnapshot,
  "phase" | "nativeAvailable" | "runtimeCompatible" | "enabled" | "origin" | "page" | "tools" | "error"
> & { paused?: boolean }

export const describeWebMcpError = (error: WebMcpBrowserSnapshot["error"]): I18nKey => {
  switch (error) {
    case "ERR_UNSAFE_PORT":
      return "webmcp.detail.unsafePort"
    case "ERR_NAME_NOT_RESOLVED":
      return "webmcp.detail.nameNotResolved"
    case "ERR_CONNECTION_REFUSED":
      return "webmcp.detail.connectionRefused"
    case "ERR_CONNECTION_TIMED_OUT":
      return "webmcp.detail.connectionTimedOut"
    case "ERR_INTERNET_DISCONNECTED":
      return "webmcp.detail.offline"
    case "ERR_CERT_AUTHORITY_INVALID":
    case "ERR_CERT_DATE_INVALID":
      return "webmcp.detail.certificate"
    case "ERR_INVALID_URL":
      return "webmcp.detail.invalidUrl"
    case "ERR_ABORTED":
      return "webmcp.detail.aborted"
    case "session-required":
      return "webmcp.detail.sessionRequired"
    case "runtime-incompatible":
      return "webmcp.detail.runtimeIncompatible"
    case "disconnected":
      return "webmcp.detail.disconnected"
    case "enable-failed":
      return "webmcp.detail.enableFailed"
    case "operation-failed":
      return "webmcp.detail.operationFailed"
    case "start-failed":
    default:
      return "webmcp.detail.startFailed"
  }
}

/**
 * Collapses the browser projection into one status line shared by the
 * Services dropdown, the Settings card and the browser pane itself, so every
 * surface tells the same story about the same browser.
 */
export function summarizeWebMcpBrowser(state: SummaryInput, env: { isElectron: boolean }): WebMcpSummary {
  if (!env.isElectron) {
    return {
      tone: "default",
      stateKey: "webmcp.state.unavailable",
      detailKey: "webmcp.detail.desktopOnly",
      canOpen: false,
    }
  }
  if (state.phase === "error") {
    return {
      tone: state.error === "session-required" ? "default" : "error",
      stateKey: state.error === "session-required" ? "webmcp.state.off" : "webmcp.state.error",
      detailKey: describeWebMcpError(state.error),
      canOpen: true,
    }
  }
  if (state.error && state.error !== "session-required" && state.phase !== "starting") {
    // An operation failed on a live browser: say so everywhere until the next attempt clears it.
    return {
      tone: "error",
      stateKey: "webmcp.state.error",
      detailKey: describeWebMcpError(state.error),
      canOpen: true,
    }
  }
  if (state.paused) {
    return { tone: "warning", stateKey: "webmcp.state.paused", detailKey: "webmcp.detail.paused", canOpen: true }
  }
  if (state.runtimeCompatible === false) {
    return {
      tone: "error",
      stateKey: "webmcp.state.unavailable",
      detailKey: "webmcp.detail.runtimeIncompatible",
      canOpen: true,
    }
  }
  if (state.phase === "starting") {
    return { tone: "default", stateKey: "webmcp.state.starting", detailKey: "webmcp.detail.starting", canOpen: true }
  }
  if (state.runtimeCompatible === null) {
    return {
      tone: "default",
      stateKey: "webmcp.state.unknown",
      detailKey: "webmcp.detail.compatibilityUnknown",
      canOpen: true,
    }
  }
  if (state.phase === "idle") {
    return { tone: "default", stateKey: "webmcp.state.off", detailKey: "webmcp.detail.closed", canOpen: true }
  }
  if (!state.nativeAvailable) {
    return {
      tone: "error",
      stateKey: "webmcp.state.unavailable",
      detailKey: "webmcp.detail.nativeUnavailable",
      canOpen: true,
    }
  }
  const origin = state.origin ?? ""
  if (state.enabled) {
    // Enrolled without a grantable page: the runtime refuses every call until the user loads one,
    // so "on" would be a lie. Say what the user has to do instead.
    if (!origin) {
      return state.page === "unsupported"
        ? {
            tone: "warning",
            stateKey: "webmcp.state.pageUnsupported",
            detailKey: "webmcp.detail.pageUnsupported",
            canOpen: true,
          }
        : {
            tone: "warning",
            stateKey: "webmcp.state.waitingForPage",
            detailKey: "webmcp.detail.waitingForPage",
            canOpen: true,
          }
    }
    // A page that registered nothing is the normal result for most websites, not a fault.
    if (state.tools === 0) {
      return {
        tone: "default",
        stateKey: "webmcp.state.on",
        detailKey: "webmcp.detail.enabledNoTools",
        detailParams: { origin },
        canOpen: true,
      }
    }
    return {
      tone: "success",
      stateKey: "webmcp.state.on",
      detailKey: "webmcp.detail.enabledWithOrigin",
      detailParams: { origin, count: state.tools },
      canOpen: true,
    }
  }
  if (!origin && state.page === "unsupported") {
    return {
      tone: "warning",
      stateKey: "webmcp.state.off",
      detailKey: "webmcp.detail.pageUnsupported",
      canOpen: true,
    }
  }
  return {
    tone: "warning",
    stateKey: "webmcp.state.off",
    detailKey: origin ? "webmcp.detail.readyWithOrigin" : "webmcp.detail.readyNoOrigin",
    detailParams: { origin, count: state.tools },
    canOpen: true,
  }
}

/** A recovery action repairs browser state only; it never replays an agent call. */
export function webMcpErrorAction(error: WebMcpBrowserSnapshot["error"]): "address" | "reload" | "enable" | "reopen" {
  switch (error) {
    case "ERR_UNSAFE_PORT":
    case "ERR_NAME_NOT_RESOLVED":
    case "ERR_INVALID_URL":
    case "ERR_CERT_AUTHORITY_INVALID":
    case "ERR_CERT_DATE_INVALID":
      return "address"
    case "enable-failed":
    case "runtime-incompatible":
      return "enable"
    case "start-failed":
    case "disconnected":
      return "reopen"
    default:
      return "reload"
  }
}
