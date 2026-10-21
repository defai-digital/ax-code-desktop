import type { MainTab } from "@/stores/useUIStore"
import type { BesideChatView } from "./openBesideChat"

/**
 * Decide whether a main-tab change should be redirected beside the chat.
 * Returns the view to open beside the chat, or null when no redirect applies:
 * chat itself, or any tab on mobile (where the full-cover view is used).
 */
export function resolveBesideChatRedirect(tab: MainTab, isMobile: boolean): BesideChatView | null {
  if (isMobile) return null
  if (tab === "chat" || tab === "session-grid") return null
  return tab
}
