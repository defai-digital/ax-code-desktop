/**
 * Config pages (Agents, Commands, MCP, Plugins, …) remember the selected item in a persisted store
 * slice. That name can outlive the item — it was renamed or removed from another client, or the
 * loaded list belongs to a different project — and the page would then render an editor for a name
 * that no longer resolves (Save stays disabled, or the pane stays on its loading skeleton).
 *
 * Two cases must not be mistaken for a stale selection:
 *   - the list is still loading, so nothing has resolved yet;
 *   - the selection is an item the user is creating, whose draft is not in the list yet.
 */
export const isStaleConfigSelection = (input: {
  isLoading: boolean
  selectedName: string | null | undefined
  selectedItem: unknown
  draft?: unknown
}): boolean => {
  if (input.isLoading) return false
  if (!input.selectedName) return false
  if (input.selectedItem) return false
  return !input.draft
}
