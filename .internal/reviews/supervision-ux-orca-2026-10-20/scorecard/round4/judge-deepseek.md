## Round 4 scorecard (judge, read-only; AX claims verified at HEAD)

**Verification note.** All round-4 claims are present in source: persisted, per-directory threads with resolve/reopen and re-send (`useReviewThreadStore.ts:75-134`, `ReviewThreadList.tsx:70-72`, `DiffCommentSummaryBar.tsx:80-172`); re-anchoring that refuses to guess on ambiguity (`reanchorThread.ts:6-30`, fed by live displayed content at `PierreDiffViewer.tsx:206-209`); blob-keyed persisted viewed marks with explicit fallback (`useReviewProgressStore.ts:92-114,246-295`, `service.js:1753-1768`); open-beside with its own composer, cross-project (`openSessionBeside.ts:9-22`, `MissionControlRow.tsx:74-78`, `MissionControl.tsx:274-290`, `ContextPanel-impl.tsx:2726-2727`); unread marker, facet and mark-unread (`MissionControlRow.tsx:148-156`, `MissionControlFilters.tsx:113-126`, `useSupervisionStore.ts:210-216`, `MissionControlPeek.tsx:170`); session-rail editor open at first change (`SessionChangesView.tsx:247-257`); WebMCP `open-beside` step (`supervision-workspace-webmcp.mjs:466-485`).

**1. Scores (1–10)**

| Surface (weight) | AX | Orca | opencode | Codex | Claude Code |
|---|---:|---:|---:|---:|---:|
| Mission Control / overview (40%) | **8.2** | 9.0 | 6.3 | 7.6 | 8.4 |
| Workspace / layout (25%) | **7.2** | 9.0 | 6.6 | 7.8 | 8.8 |
| Review changes (35%) | **8.3** | 8.8 | 7.0 | 8.2 | 8.6 |

**Overview — vs Orca:** AX now has Orca's filter grammar (project multi-select with facet-following counts, chips, Clear all, `MissionControlFilters.tsx:68-126`), a "what changed while I was away" signal with manual mark-unread, and previews in every density. Orca still leads because subagents are inline rows with their own state (AX shows a "+N agents" badge and a Details count, `MissionControlRow.tsx:191-200`) and because its cross-worktree event feed puts "what happened" in one stream instead of per-row time comparisons.
**Overview — vs opencode:** AX's global, answerable Needs-You inbox, ranked board, batch stop/archive and unread facet make supervising twenty sessions one screen; opencode has no board, only titlebar tabs and per-session prompt docks, so noticing a blocked agent still requires hunting.

**Workspace — vs Orca:** Open-beside is real and well built — a live session with its own composer, its own directory, and a journey asserting visibility — but it mounts inside the right context panel at a fixed narrow width, so two agents, two diffs and two terminals cannot be compared at once. Orca's per-worktree pane trees, drag-to-split and pane pop-out remain a different class of surface.
**Workspace — vs opencode:** Both are effectively single-session-plus-right-panel; AX wins on the second live session, tool breadth (files, diff, git, terminal, plan, browser) and a resizable, per-directory context panel, while opencode's titlebar session tabs with unread still make plain switching cheaper. Close.

**Review — vs Orca:** Threads now survive edits with Resolve/Reopen and name their recipient, branch scope diffs against a validated merge-base, and viewed marks are content-identity keyed and persistent — all three round-3 flip items are genuinely closed. Orca keeps the edge where review becomes "landing": inline three-way merge, one Stage→Commit→Push button, F7 change-level navigation, and comments that are also pins in the diff rather than only list entries.
**Review — vs opencode:** AX is clearly ahead — stage/unstage/hunk revert, commit with Cmd/Ctrl+Enter, image diffs, five-plus scopes, targeted comment delivery; opencode offers a nicer file tree and turn undo/redo but no commit path.

**2. Weighted overall**

AX **7.94** · Orca **8.90** · Claude Code **8.56** · Codex **7.85** · opencode **6.58**

**AX vs Orca: worse**
**AX vs opencode: better**

**3. Three smallest changes most likely to flip AX vs Orca**

1. **Give open-beside a real width and its own tabs.** Let the beside pane be widened beyond the context panel (a draggable second column or drag-to-split of the main area) and mount diff/terminal tabs in it, not just chat. Round 4 built the right primitive at `openSessionBeside.ts:9-22`; only the geometry and the mounted surfaces keep it below Orca's splits. Workspace carries 25% and is AX's largest single deficit.
2. **Render child sessions as indented board rows.** Extend `treeSessionIds` (already used for the count badge, `MissionControlRow.tsx:191`) into collapsible child rows with their own state, preview and open action, still rolling up into the root. This closes Orca's clearest awareness advantage on the 40%-weighted surface and reuses data already on the row.
3. **Merge threads back into the diff and keep a cross-repository activity stream.** Anchor existing threads as inline markers at their re-anchored lines (`reanchorThread` output is already computed per file, `ReviewThreadList.tsx:23-34`) so a reviewer sees open notes without opening a list, and summarise thread sends plus unread updates into one feed. Orca's remaining lead is continuity of attention, not feature breadth.

Caveat: the gap is now ~0.95 weighted and concentrated in workspace width and overview awareness; items 1 and 2 together are the plausible flip, and this warrants re-judging rather than a declared win.