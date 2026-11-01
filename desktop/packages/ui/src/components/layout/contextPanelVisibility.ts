import type { MainTab } from "@/stores/useUIStore"

/**
 * MainLayout keeps the context panel mounted under the session grid, so a pane can reveal its page
 * without leaving the grid, and hides it until the grid's browser takes focus. The panel's files
 * view pauses its polls under the same rule, so the two cannot drift apart.
 */
export const isContextPanelHiddenUnderGrid = (activeMainTab: MainTab, gridBrowserOpen: boolean): boolean =>
  activeMainTab === "session-grid" && !gridBrowserOpen
