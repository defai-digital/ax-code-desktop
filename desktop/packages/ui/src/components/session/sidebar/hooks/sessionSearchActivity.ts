/**
 * Whether the session search is really filtering the sidebar.
 *
 * The query outlives the field that shows it: closing the field (clicking outside, Escape, the
 * header toggle) used to leave the query set, so every group stayed filtered by text that was no
 * longer on screen and the sidebar showed an empty state with no visible cause and no way to
 * clear it. The field being open is what makes a query active.
 */
export const isSessionSearchActive = (input: { isSessionSearchOpen: boolean; normalizedQuery: string }): boolean =>
  input.isSessionSearchOpen && input.normalizedQuery.length > 0
