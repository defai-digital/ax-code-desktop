## Round 6–8 judgment (independent, read-only; AX verified at HEAD)

All round6–8 claims verified in source: four beside tabs `App.tsx:93`; progressive landing with re-read/abort `views/git/ReviewLanding.tsx:27,48-51,120-146`; grid + splitters `sessionGrid/SessionGrid.tsx:89,185-200`; pane-scoped F7 with composing guard `hooks/useReviewHunkKeys.ts:53,86,142,159`; envelopes read from `session/{id}/risk?envelopes=true` `lib/supervision/verificationEvidence.ts:2,66-72`; arm-then-confirm batch `supervision/PermissionBatchBar.tsx:23-25,30,36`; "Try it" grants nothing `mcp/WebMcpToolPanel.tsx:188-189`; browser start/stop in feed `lib/supervision/browserActivity.ts:18-28`; pause/resume + one fix action `layout/EmbeddedWebMcpBrowser.tsx:68,318-322,374`; no "Always allow" for the project browser `chat/PermissionCard.tsx:194-197`. CI matrix `desktop-ci.yml:265`; Windows still un-re-run — an evidence gap, not a product gap.

### 1. Per surface

| Surface | AX | Orca | opencode | Codex | Claude |
|---|---:|---:|---:|---:|---:|
| Mission Control / overview (40%) | 9.0 | 9.1 | 6.5 | 7.8 | 8.6 |
| Workspace / layout (25%) | 8.8 | 9.1 | 7.0 | 8.1 | 9.0 |
| Review changes (35%) | 8.9 | 9.0 | 7.4 | 8.7 | 8.8 |

**Overview — AX vs Orca.** The Checks chip is the one capability here Orca's facts file never claim, and previews, feed and child rows now close the awareness gap. Orca still wins the *out-of-board* signal: header bell, dock badge, working→idle notification (`competitor-facts.md:8`) — AX's feed is a board column behind a toggle — plus PR/MR facet and card state (`:7`) and no 3-child cap.

**Overview — AX vs opencode.** A global answerable inbox plus a board collapses twenty sessions to one screen; opencode has no board and only per-session prompt docks (`:21`), so noticing a blocked agent costs one opened session each.

**Workspace — AX vs Orca.** Rounds 6–7 closed the exact deficit all three round-5 judges named — the beside slot is now a workspace, not a chat (`App.tsx:93`), and four sessions run side by side with keyboard splitters (`SessionGrid.tsx:89`). Orca remains a different class: per-worktree pane trees with drag-to-split and pane pop-out (`:12-13`); AX's grid is a fixed 2×2, not free-form.

**Workspace — AX vs opencode.** AX shows four live sessions, each with its own chat, diff, files and terminal; opencode documents no split panes at all, only a resizable right panel (`:22`).

**Review — AX vs Orca.** ReviewLanding and F7 close Orca's two named advantages (one-button landing, hunk-level `F7`) with real safety: staging aborts if files changed after review (`:120-131`) and committing aborts if the index no longer matches the list on screen (`:139-146`). Orca keeps inline 3-way merge and staging inside Branch scope — both **not found** in AX (`BranchChangesView.tsx` has no stage callback).

**Review — AX vs opencode.** AX wins on six scopes, per-hunk stage, threads with Resolve, a target picker, and verified landing; opencode's better file tree and per-turn undo/redo (`:23-25`) do not offset it.

### 2. Weighted (40/25/35)

**AX 8.92** · Orca 9.07 · Claude 8.72 · Codex 8.00 · opencode 6.94

**AX vs Orca: worse** (gap 0.3 → 0.15)
**AX vs opencode: better**

### 3. Three smallest changes to flip Orca

1. **Wire staging into Branch scope** — pass `ReviewLanding`'s existing per-file callbacks into `BranchChangesView`; today Orca and Codex can land from any scope and AX cannot.
2. **Inline 3-way merge** in `ConflictDialog` instead of delegating to a session.
3. **Move the feed outside the board** — header bell + dock badge reusing the store that already computes unread (`MissionControlHeader.tsx`), so "what happened while I was away" is reachable from any surface.