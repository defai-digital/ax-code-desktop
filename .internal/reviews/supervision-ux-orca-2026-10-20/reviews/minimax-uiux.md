I've read the core supervision sources. Note: the `captures.json` read was declined, so everything below is grounded in source, not render data.

## 1. Better than / worse than each competitor

**vs Orca.** Better: the board is a real triage surface, not an optional plugin — rows are urgency-ranked with blocked-oldest-first ordering (`lib/supervision/sessionState.ts:120`), needs-you rows carry a persistent amber left border plus inline Details with approve/deny request cards (`MissionControlRow.tsx:104`, `MissionControl.tsx:371`). The "N need you · M running" header (`MissionControlHeader.tsx:105`) and the `next_needs_you` shortcut that walks needs-you sessions in urgency order with wraparound (`useSupervisionShortcuts.ts:58`) beat Orca's Cmd-J palette for steady-state triage. Worse: **Orca's multi-select is entirely missing** — no checkbox, no `selectedIds`, no batch action anywhere in the board (Orca batches "Send to agent" across sessions; you can only act per-row via `MissionControlRow.tsx:175`). Your command palette exposes only four fixed supervision commands (`CommandPalette.tsx:165-205`) — there is no ranked session jump list. Orca also filters by PR state; you have no PR dimension.

**vs Codex desktop.** Better: the file rail with `N of M viewed`, a progress bar and auto-invalidate-on-agent-edit signatures (`ReviewFileRail.tsx:55`, `stores/useReviewProgressStore.ts:27`) is a genuine "did I actually review all 12 files" mechanism Codex lacks. Codex's own list hides that. Worse: **your review header has no scope selector.** `diffScope` is a prop with values `"all" | "staged" | "working"` (`DiffView.tsx:70,892`), and nothing in the header block (`DiffView.tsx:1801-1907`) lets a user switch it. Codex offers Unstaged/Staged/Commit/Branch/Last turn; opencode offers git/branch/turn. For a supervisor triaging 20 branches this is the single largest functional gap.

**vs Claude Code desktop.** Better: side-by-side chat+diff is permanent, and per-hunk stage/revert exists inline. Claude's Cmd+Enter "submit all comments" you match. Worse: Claude's `/code-review` findings walk-through ("Fix this one") has no equivalent — nothing turns a review into a fix request in one action.

**vs opencode.** Better: unified/split toggle, prev/next and wrap are all here; opencode's arrow-key hints are the weaker half of that pair. Worse: same missing scope selector, and your stacked mode collapses to `getStackedViewDefaultExpandedCount` rather than letting you sweep hunks.

## 2. Top 8 defects, ranked

1. **No review scope picker.** Add an Unstaged/Staged segmented control to the header next to the mode selector; lift `diffScope` from prop to `useUIStore` local state. `DiffView.tsx`, `stores/useUIStore.ts`.
2. **No multi-select or batch action on the board.** Add a checkbox column (visible in Compact), `selectedSessionIds` in `useSupervisionStore`, Space/Shift-click to toggle, and a bulk bar ("Approve 6 requests", "Add to working set", "Send message"). `MissionControlRow.tsx`, `MissionControl.tsx`, `useSupervisionStore.ts`.
3. **Top-nav "Review changes" is disabled whenever no directory is active** (`WorkspaceNavigation.tsx:47`) — a dead, unexplained button. Hide it or open the board instead of disabling.
4. **Label collision: "Review changes" names both a nav surface and a row primary action** (`WorkspaceNavigation.tsx:44`, `MissionControl.tsx:194`). Rename the row action to "Review diff" or the nav tab to "Review".
5. **Overlapping status filters.** "Needs attention" includes `review` (`lib/supervision/missionControl.ts:61`) while a separate "Changes to review" chip also matches it, so chip counts sum past "All". Exclude `review` from `attention`.
6. **Over-limit badge is permanent noise at target scale.** `HIGH_TOUCH_SOFT_LIMIT = 4` (`sessionState.ts:155`) vs a 5-20 session goal — it fires on every good day. Raise it or make it show headroom instead.
7. **No ranked jump palette.** Add a session mode to `CommandPalette` listing `rankSupervisionRows` results, needs-you first. Reuse existing ranking; no new contract.
8. **"Recent" is a hardcoded 24h window** (`lib/supervision/missionControl.ts:16`) with no way to widen it when a session has been quiet longer.

## 3. What's confusing in the current rendering

- **Two overlapping layout controls.** `DiffViewModeSelector` (Single/Stacked) and `DiffViewToggle` (split/unified) sit in one header row (`DiffView.tsx:1854,1902`). A user can't tell whether "Stacked" and "split" compose or conflict. Merge into one segmented layout control.
- **Two meanings of "reviewed".** The header says "N files changed" while the rail says "N of M viewed" — one is git state, one is your own progress, and nothing in the header signals the second. Surface the viewed count in the header too.
- **Narrow-pane fallback uses literal `☑`/`☐` glyphs** (`ReviewFileRail.tsx:195`), visually inconsistent with the rail's real checkbox and the rest of the icon set.
- **`Recent` vs `Live` reads as a filter but changes scope semantics**, and selecting a working set silently clears both (`MissionControl.tsx:299-308`) — no indication you're no longer in Live.
- **Working-set `+` and the `Live/Recent` chips share one pill group** (`MissionControlHeader.tsx:157-232`); a bare `+` next to mode names reads as "add mode", not "new set".

Highest-leverage pair: #1 (scope picker) and #2 (multi-select). Together they close the two places a competitor is concretely stronger.