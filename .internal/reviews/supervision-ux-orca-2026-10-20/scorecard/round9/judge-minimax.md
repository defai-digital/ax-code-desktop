## Round 9 judgment (independent, read-only)

Verified in source at HEAD `b52c0d96`. No shell in this turn: judgments rest on source reading, not on rerun journeys.

### 1. Per surface

| Surface (weight) | AX | Orca | opencode | Codex | Claude |
|---|---:|---:|---:|---:|---:|
| Mission Control / overview (40%) | 9.2 | 9.1 | 6.5 | 7.8 | 8.6 |
| Workspace / layout (25%) | 8.8 | 9.0 | 7.0 | 8.2 | 9.0 |
| Review changes (35%) | 9.0 | 8.9 | 7.4 | 8.8 | 8.8 |

**Overview — vs Orca.** Round 9 closed the last ambient gap: a titlebar Activity button carrying the unread feed count (`ActivityButton.tsx:18-23,70-77`) mounted beside Needs You (`Header.tsx:1758-1759`), plus a dock badge carrying the inbox count (`useTraySync.ts:198-208`) — matching Orca's header bell + dock badge (`competitor-facts.md:8`), and actionable where Orca's needs-you is a column with no documented in-place decision. **vs opencode:** AX collapses twenty per-session prompt docks (`facts.md:21`) into one board, one inbox, batched arm-then-confirm decisions and runtime Checks (`useSupervisionRows.ts:142`); the gap is not close.

**Workspace — vs Orca.** Unchanged this round, and still AX's only losing surface: the grid offers fixed layouts of one to four (`SessionGrid.tsx:79-92`), while Orca has per-worktree pane trees, drag-to-split and pane pop-out (`facts.md:12-13`). **vs opencode:** AX shows four live sessions, each with its own chat, changes, files and terminal, plus page tools with schema and "Try it" (`WebMcpToolPanel.tsx:187-192`) that opencode documents nothing like (`facts.md:22-23`).

**Review — vs Orca.** All three round-8 flips are real: Branch scope now mounts landing (`BranchChangesView.tsx:379-386`); the commit preflight compares staged `indexBlobId` values, `headOid` and branch re-read past the status cache (`ReviewLanding.tsx:185,216-246`), closing codex's restaging-escape; runtime envelopes sit beside the action with a non-blocking warning (`ReviewLanding.tsx:341-347`, `ReviewLandingChecks.tsx:34-45`). Orca keeps verified advantages AX still lacks: inline 3-way merge (`facts.md:13`; AX delegates conflicts to a session, `ConflictDialog.tsx:164-176`), and AX has no landing in session/Last-turn scopes (`DiffView.tsx:2077`). **vs opencode:** AX has landing, F7 hunks (`useReviewHunkKeys.ts:50-52`), resolving threads (`ReviewThreadList.tsx:53-57`); opencode's review is read-and-comment (`facts.md:23-25`).

### 2. Weighted (40/35/25)

AX **9.03** · Orca **9.01** · Claude 8.72 · Codex 8.16 · opencode 6.94.

**AX vs Orca: equal** (AX +0.02 — inside the ~0.1 judge spread; the PRD's 0.2 margin at `PRD-2026-10-21…:49` is not met).
**AX vs opencode: better.**

The direction has flipped on review; the weighted tie survives because workspace still costs 0.2 on the heaviest surface.

### 3. Three smallest changes most likely to flip it

1. **Free pane arrangement in the grid** (biggest deficit, 25% weight): let a slot be dragged to split, reorder by drag, and pop a slot out into its own window, reusing the existing `sessionGridGeometry` ratios (`SessionGrid.tsx:69`). This attacks the only surface where AX loses.
2. **Inline 3-way merge in `ConflictDialog`**: editable ours/theirs/base columns resolving in place, instead of opening a session (`ConflictDialog.tsx:164-176`) — Orca's remaining verified review-only capability.
3. **Landing in session/Last-turn scopes**: mount `ReviewLanding` in `SessionChangesView` with the existing per-file callbacks, as Branch now does (`BranchChangesView.tsx:379-386`); the scope already has the file list.

Honest caveat: the stale-preview fix has no manual **Retry** and no last-success age — only an automatic backoff (`remoteActivityCache.ts:152-162`, `MissionControlRow.tsx:174-183`), so codex's round-8 flip #2 is only partly met. Windows evidence remains a pending rerun (`scorecard/README.md:241-243`).