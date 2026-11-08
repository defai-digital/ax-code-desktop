# Workspace UX v1 technical contract

Status: Authorized implementation specification for PRD-2026-11-08-workspace-ux-v1.

- Keep the existing UI and supervision stores as the owners of display preferences. Do not add a parallel navigation,
  approval, project or runtime store. Portfolio opens the existing Mission Control projection.
- Right-sidebar visibility suspends the split inspector using the existing mounted suspension contract. A successful
  non-terminal inspector navigation hides the sidebar only after the Files guard accepts navigation. A refused guard
  preserves the current board, sidebar and editor. Terminal remains in the bottom dock.
- Keep a stable conversation wrapper when opening and closing the inspector. Suspended inspectors retain their editor DOM. Focus expansion also retains the conversation DOM and its draft.
  Focus must move out of hidden content. The explicit return action uses closeBesideChat and its existing Files guard.
- Use workspace container width, not window width, for single-pane inspector layout. Narrow layouts show the inspector
  with a return action; wide layouts allow split or focused inspection. Existing grid suspension retains priority.
- Starter disclosure changes rendering only, never persisted starter definitions. Preserve group-local order and accessible
  keyboard reorder announcements. Projects precede starters; composer and Needs You retain their order.
- Compact path labels retain enough trailing path segments to distinguish collisions. Full paths remain in accessible
  action names, title/tooltips and canonical payloads. Do not shorten API paths or IDs.
- Retry presentation is an optional projection of the root session's reported status, used only when its rolled-up state
  is running. A blocking request takes precedence; child retries must not be attributed to a root without evidence.
- Sidebar transition defaults must allow the system reduced-motion media query to win. Inline transition suppression
  is reserved for active resizing; settled native geometry is qualified separately from animation timing.
