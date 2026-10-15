import type { MainTab } from "@/stores/useUIStore"

/**
 * Tabs that may be restored into the split pane. Adding a MainTab without a key here fails
 * typecheck. Unknown persisted values fall back to the in-memory default instead of being dropped
 * along with the rest of the UI store.
 */
export const PERSISTED_SPLIT_PANE_RIGHT_TABS = {
  plan: true,
  git: true,
  diff: true,
  terminal: true,
  files: true,
  context: true,
  wiki: true,
} as const satisfies Record<Exclude<MainTab, "chat">, true>

export function isPersistedSplitPaneRightTab(value: unknown): value is Exclude<MainTab, "chat"> {
  return typeof value === "string" && Object.prototype.hasOwnProperty.call(PERSISTED_SPLIT_PANE_RIGHT_TABS, value)
}
