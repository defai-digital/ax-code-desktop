## Evidence check (read-only)

All six round-3 claims are in HEAD source: project multi-select + Has changes + removable chips + Clear all with facet-count base (`MissionControlFilters.tsx`, `MissionControl.tsx:116-131`); child count badge and Details child list (`childSessions.ts`, `MissionControlPeek.tsx:101`, `MissionControlRow.tsx:170-178`); activity preview in every density (`MissionControlRow.tsx:60-62`, compact-density test); Branch scope against a validated base's merge-base with file/byte caps (`BranchChangesView.tsx:167`, `web/server/lib/git/service.test.js:2330-2437`); comment target picker across same-project sessions (`DiffCommentSummaryBar.tsx:143-157`); session window (`openSessionWindow.ts`). No in-window second session exists — the split pane is still tools-only (`openBesideChat.ts:19-21`).

## 1. Scores

| Surface (weight) | AX | Orca | opencode | Codex | Claude |
|---|---|---|---|---|---|
| Mission Control / overview (40%) | 8.0 | 8.7 | 6.3 | 7.4 | 8.1 |
| Workspace / layout (25%) | 6.5 | 8.8 | 6.2 | 7.4 | 8.5 |
| Review changes (35%) | 8.1 | 8.7 | 7.0 | 7.9 | 8.0 |

**Overview — AX vs Orca:** AX now matches Orca's filter model (project multi-select, has-changes, chips, Clear all) and adds previews in every density, so scanning cost dropped materially. Orca still wins on "what happened while I was away": PR/MR state on cards and a cross-worktree event feed with mark-unread, which AX has no equivalent for; AX's in-place Needs You answer loop is the stronger action path. **AX vs opencode:** opencode has no multi-session board, only titlebar tabs and per-session permission docks, so noticing five blocked agents means opening five sessions; AX's ranked, filterable board with previews and batch stop/archive is plainly ahead.

**Workspace — AX vs Orca:** Orca's per-worktree pane trees and drag-to-split hold two agents and their diffs in one window; AX is still one session per window, and round 3 added only an Electron-only extra OS window, so side-by-side supervision depends on window tiling. AX's inspector, three-entry navigation and bottom terminal compete per session, but the persona's unit here is two sessions. **AX vs opencode:** opencode's titlebar tabs with unread/progress make switching cheaper than AX's sidebar-only model even though it also lacks splits; AX wins on tool breadth (files, git, terminal, plan, browser) and resizable panes, loses on tab-level continuity.

**Review — AX vs Orca:** Branch scope now diffs the working tree against a selectable base's merge-base with validated refs, and AX still uniquely offers per-hunk stage/revert plus viewed progress — the round-2 base gap is closed. Orca still leads where supervision matters: comments pin across edits, threads resolve, and Stage→Commit→Push is one button; AX comments keep fixed line anchors with no resolve, so notes silently detach while an agent keeps editing. **AX vs opencode:** AX has five scopes including branch plus stage/commit controls; opencode offers git/branch/turn with a filterable tree and turn revert but no stage/discard/commit, so AX's target picker and commit path keep landing in-product.

## 2. Weighted overall

AX **7.7** · Orca **8.7** · Claude **8.2** · Codex **7.6** · opencode **6.5**

AX vs Orca: **worse**
AX vs opencode: **better**

## 3. Three smallest changes most likely to flip it

1. **Make child agents board rows, not a count.** Render descendants as indented rows with their own state, preview and open action, still rolling up into the root. Overview carries 40% weight and this is Orca's clearest remaining awareness win.
2. **Split the main window into two independent sessions.** Cmd/Ctrl-click a row to mount a second session (own composer) beside the current one; keep the OS window as an extra. Workspace is 25% weight and the only structural deficit left there.
3. **Re-anchor inline comments on content and add resolve state.** Store before/after hunk context with each draft, re-anchor across edits, and let threads resolve, persisted per diff identity. Review is 35% weight, and drifting comments are the failure that makes long agent edits unsafe to land.

Caveat: the ~1.0 weighted gap is concentrated in workspace width and comment lifecycle, so 1–3 narrow it decisively but may not flip it alone; 1 and 2 together are the plausible flip.