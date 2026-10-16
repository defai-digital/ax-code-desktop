import type { SidebarSection } from "@/constants/sidebar"
import type { MainTab } from "@/stores/useUIStore"

/**
 * Represents the current route state derived from URL parameters.
 * All fields are nullable - null means "not specified in URL" (use app defaults).
 */
export interface RouteState {
  /** Session ID to navigate to */
  sessionId: string | null
  /** Main tab to display (chat, git, diff, terminal, files) */
  tab: MainTab | null
  /** Settings section - when non-null, settings dialog should be open */
  settingsPath: string | null
  /** File path for diff view */
  diffFile: string | null
}

/**
 * Valid main tab values for URL routing.
 *
 * Every value `MainTab` can hold, because that is what `serializeRoute` writes: a
 * shorter list meant `?tab=wiki`, `?tab=plan` and `?tab=context` were written to the URL and then
 * rejected on the way back in, so a reload or a history entry could not restore those tabs.
 */
export const VALID_TABS: readonly MainTab[] = [
  "chat",
  "plan",
  "git",
  "diff",
  "terminal",
  "files",
  "context",
  "wiki",
  "board",
] as const

/**
 * Valid settings section values for URL routing.
 */
export const VALID_SETTINGS_SECTIONS: readonly SidebarSection[] = [
  "settings",
  "agents",
  "commands",
  "skills",
  "providers",
  "git-identities",
] as const

/**
 * The tab a route without a `tab` parameter means.
 */
export const DEFAULT_TAB: MainTab = "chat"

/**
 * URL parameter names used for routing.
 */
export const ROUTE_PARAMS = {
  SESSION: "session",
  TAB: "tab",
  SETTINGS: "settings",
  FILE: "file",
} as const
