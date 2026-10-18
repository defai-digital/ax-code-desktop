# Grok implementation review

Date: 2026-10-18
Runner: Grok CLI, tools disabled, no subagents or web search.
Terminal status: process exit 0.
Input: scoped TS/CSS diff before follow-up fixes; locale and documentation files were excluded.
These are reviewer leads; see the implementation report for verified dispositions.

Verified issues are in the navigation keyboard guard, the mobile board entry, the inspector rail, permission preview, and the compact row breakpoint. Async permission actions and the review-open guard match the new tests.

### Medium
**Density `<select>` is outside the board shortcut guard.** `MissionControl.tsx` ignores Space, Enter, `j`, and `k` only for `button, a[href], summary`. The new control in `MissionControlHeader.tsx` is a `<select>` inside that `onKeyDown` region. Space or Enter can run the row shortcut while the select is focused. Add `select, input, textarea` to that `closest()` check.

**Mobile can lose the board.** `Header.tsx` removes the only in-diff Mission Control control. `MainLayout.tsx` mounts `WorkspaceNavigation` only when `!isMobile`. Touch users have no replacement in this diff unless a shortcut or command outside the diff still opens the board. Render the same nav on mobile, or keep a header entry there.

**Collapsed rail control is a poor default.** `inspectorLabels` defaults to false, and `.inspector-rail` is `3.25rem`. The toggle in `InspectorRail.tsx` always paints `supervision.inspector.tools`, with a chevron only when expanded, and no truncation. Its `aria-label` is show/hide labels, so the visible word “Tools” is not in the accessible name (WCAG 2.5.3). When collapsed, show an icon only and use an accessible name that includes any visible text.

**Expanded labels sit under the badge.** The badge is `absolute -right-0.5 -top-0.5` and does not take layout space. Reserve end padding, or place the badge in flow. `overflow-y-auto` on the `<nav>` also forces `overflow-x` to `auto`, so the negative offset can clip or scroll. Keep the badge inside the padding box.

**Permission preview can hide the deciding part of a scope.** `RequestActionCard.tsx` cuts with `pattern.slice(0, 160)`, which drops the suffix of a path or wildcard, and Allow/Deny stay enabled. A joined length over 160 also opens a disclosure for one or two short patterns that are already fully shown. Show full pattern strings in a `max-height`/`overflow-auto` list. Keep extra patterns collapsed. Do not add a disclosure that reveals nothing.

**Compact one-line rows start too late.** In `design-system.css`, every width under `44rem` is a stacked grid. From `44rem`, both densities use two rows. The one-line template is only `[data-density="compact"]` at `min-width: 68rem` (`1088px`) of the board container, which sidebars and the split pane often never reach. Apply the one-line tracks to compact at a lower container width. Also avoid `auto` for the actions column. It sizes to max-content, so long labels can overflow the `44rem` grid. Use `minmax(0, max-content)` and let `.mission-actions` wrap.

### Low
Compare and remove in `MissionControlRow.tsx` still have no `focus-visible` ring. The running badge uses `motion-safe:animate-pulse`, while the sidebar dot uses `motion-safe:animate-busy-pulse`. The narrow expanded rail (`position: absolute` under `44rem`) has no Escape-to-collapse. None of these block the path.

The review/running color swap is consistent with the old board, not a logic bug. Compare used to paint review as success and running as info. `SUPERVISION_PRESENTATION` makes running success and review info, including the sidebar `done_with_uncommitted` dot. The sidebar accessible name is still the specific uncommitted string.

### Speculative
These are not shown as defects in this diff. `WorkspaceNavigation` sets `missionControlOpen` directly instead of `toggleMissionControl()`. Confirm the helper has no extra side effects. Workspace calls `closeBesideChat("diff")` without `mainTabGuard`. Confirm close is allowed to skip the dirty-editor guard. Confirm `EvidenceText` does not force `truncate`. Confirm the overlay does not cover the rail at a higher z-index. Confirm `always` is not required scope copy. Arrow-key handling is not in the diff. If it exists on the same handler, the select needs the same exclusion.

### Checked and sound
The request ref blocks same-tick double submits, re-enables after failure, and still sends `once`, `reject`, and the original question payload. Expansion resets when the request id changes. Blank patterns are dropped. Review navigation stays on the board when `openBesideChat("diff")` fails the guard. Display prefs persist and do not clear `boardFocusSessionId`. Header terminal and split subscriptions remain.
