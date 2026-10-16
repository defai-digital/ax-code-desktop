import type { MainTab } from "@/stores/useUIStore"
import { type RouteState, VALID_TABS, VALID_SETTINGS_SECTIONS, ROUTE_PARAMS, DEFAULT_TAB } from "./types"

/**
 * Parse the current URL search parameters into a RouteState.
 * Returns null values for any parameter that is missing or invalid.
 */
export function parseRoute(searchParams?: URLSearchParams): RouteState {
  const params = searchParams ?? getSearchParams()

  return {
    sessionId: parseSessionId(params),
    tab: parseTab(params),
    settingsPath: parseSettingsPath(params),
    diffFile: parseDiffFile(params),
  }
}

/**
 * Safely get URLSearchParams from the current location.
 */
function getSearchParams(): URLSearchParams {
  if (typeof window === "undefined") {
    return new URLSearchParams()
  }

  try {
    return new URLSearchParams(window.location.search)
  } catch {
    return new URLSearchParams()
  }
}

/**
 * Parse session ID from URL parameters.
 * Returns null if missing or empty.
 */
function parseSessionId(params: URLSearchParams): string | null {
  const value = params.get(ROUTE_PARAMS.SESSION)
  if (!value || value.trim().length === 0) {
    return null
  }
  return value.trim()
}

/**
 * Parse main tab from URL parameters.
 * Returns null if missing or invalid.
 */
function parseTab(params: URLSearchParams): MainTab | null {
  const value = params.get(ROUTE_PARAMS.TAB)
  if (!value) {
    return null
  }

  const normalized = value.toLowerCase().trim() as MainTab
  if (VALID_TABS.includes(normalized)) {
    return normalized
  }

  return null
}

/**
 * Parse settings target from URL parameters.
 * Returns null if missing/empty.
 */
function parseSettingsPath(params: URLSearchParams): string | null {
  const value = params.get(ROUTE_PARAMS.SETTINGS)
  if (!value) {
    return null
  }

  const normalized = value.toLowerCase().trim()

  if (normalized.length === 0) {
    return null
  }

  // Handle common aliases
  if (normalized === "openchamber" || normalized === "general" || normalized === "preferences") {
    return "home"
  }

  // Keep legacy section ids as-is (mapping happens at apply time).
  if ((VALID_SETTINGS_SECTIONS as readonly string[]).includes(normalized)) {
    return normalized
  }

  return normalized
}

/**
 * Parse diff file path from URL parameters.
 * Returns null if missing or empty.
 */
function parseDiffFile(params: URLSearchParams): string | null {
  // URLSearchParams.get() already percent-decodes the value once; serializeRoute
  // writes the raw path via params.set() (encoded once on serialization), so no
  // further decoding is needed here. An extra decodeURIComponent() would corrupt
  // any file path that itself contains a "%" character (e.g. "weird%2Fname.ts"
  // round-trips to "weird/name.ts").
  const value = params.get(ROUTE_PARAMS.FILE)
  if (!value || value.trim().length === 0) {
    return null
  }

  return value.trim()
}

/**
 * Fill in the defaults a route from the history or the address bar omits.
 *
 * Serialization leaves out whatever matches the app's default (the chat tab), so an entry reached by
 * Back or a reload carries only the fields that differ — and `parseRoute` answers null for those. A
 * caller that treats null as "leave the current value" then keeps the tab the user was on and its
 * `finally` rewrites the entry it just navigated to. Only the popstate and mount paths call this: a
 * store-driven update is expected to name just the fields it changes.
 */
export function withRouteDefaults(route: RouteState): RouteState {
  // A route that names a file is the documented diff deep link (`/?file=src/a.ts`): its tab is left absent
  // because `applyRoute` reads that as "the file decides", and filling in the chat default here would send
  // the deep link to chat and then rewrite the URL without the file.
  if (route.tab || route.diffFile) return route
  return { ...route, tab: DEFAULT_TAB }
}

/**
 * Check if the current URL has any route parameters.
 */
export function hasRouteParams(): boolean {
  if (typeof window === "undefined") {
    return false
  }

  try {
    const params = new URLSearchParams(window.location.search)
    return (
      params.has(ROUTE_PARAMS.SESSION) ||
      params.has(ROUTE_PARAMS.TAB) ||
      params.has(ROUTE_PARAMS.SETTINGS) ||
      params.has(ROUTE_PARAMS.FILE)
    )
  } catch {
    return false
  }
}
