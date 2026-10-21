## Round 5 scorecard (independent, read-only; AX verified in source at HEAD `d9f1b29d`)

| Surface (weight) | AX | Orca | opencode | Codex | Claude |
|---|---:|---:|---:|---:|---:|
| Mission Control (40%) | 8.9 | 9.0 | 6.5 | 7.8 | 8.5 |
| Workspace (25%) | 8.3 | 9.0 | 6.9 | 8.0 | 9.0 |
| Review changes (35%) | 8.6 | 8.8 | 7.3 | 8.5 | 8.8 |
| **Weighted** | **8.65** | **8.93** | **6.88** | **8.10** | **8.73** |

**Overview — vs Orca.** AX now closes the awareness gap it kept losing on: child agents are real indented rows with their own state and Open action (`MissionControlRow.tsx:280-311`, selection `:39-49`), a persisted 200-event transition feed carries unread count and Mark all read (`activityFeed.ts:45,100-114`, `MissionControlHeader.tsx:81-151`), and never-opened sessions get bounded previews (2 concurrent, 20 s timeout, 10 s throttle, 300 entries, directory-scoped — `remoteActivityCache.ts:18,30,92`, `useRemoteActivityPreviews.ts:29-38`). Orca keeps a small edge on PR/MR state on cards and OS/Dock badge; AX's feed is opt-in (`MissionControl.tsx:90,796`) and has no PR/MR facet.
**vs opencode.** opencode has no board and only per-session prompt docks, so noticing a blocked agent costs one opened session per agent; AX answers from the board and a global actionable inbox. opencode's synced unread tabs make plain switching cheaper, but they do not answer "what needs me now".

**Workspace — vs Orca.** The beside session is genuinely usable now: a narrow panel widens to ~half the window and carries Chat plus Changes rendered from that session's own repository (`openSessionBeside.ts:5,22-28`; `App.tsx:195,237-278`; journey asserts both composers, width ≥500 and project B's diff — `supervision-workspace-webmcp.mjs:487-500`). Orca remains a class above: per-worktree pane trees, drag-to-split, pane pop-out, and a beside slot here has no terminal and no independent geometry beyond the fixed two-column shell.
**vs opencode.** AX shows two live sessions, two composers and two diffs in one window; opencode documents no split panes, only a resizable right panel. opencode's titlebar session tabs with unread/progress are still absent in AX.

**Review — vs Orca.** Threads are no longer list-only: open threads annotate their re-anchored lines with Resolve (`PierreDiffCommentUtils.ts:42-48`, `ReviewThreadMarker.tsx:27-35`, `PierreDiffViewer.tsx:219-228,786-787`), marks hash both blob sides, status columns and path with a visible fallback badge (`useReviewProgressStore.ts:92-110`; `ReviewFileRail.tsx:147,202-207`), and the Branch base is remembered per repository and dropped if the branch disappears (`useBranchReviewBaseStore.ts:37-59`; `BranchChangesView.tsx:153,173-176,280-284`). Orca still wins on landing and locomotion: inline 3-way merge, one Stage→Commit→Push button, hunk-level F7; AX stays read-only in Branch scope and file-level for keys (`useReviewProgressStore.ts:343-346`).
**vs opencode.** AX has stage/unstage/hunk revert, commit with Cmd/Ctrl+Enter, six scopes, image diffs, target picker for sending threads (`DiffCommentSummaryBar.tsx:231-244`); opencode's review has no documented commit path. opencode's file tree and per-turn undo/redo remain locally nicer.

**AX vs Orca: worse** (8.65 vs 8.93)
**AX vs opencode: better**

Three smallest changes most likely to flip it (workspace carries the largest weighted gap, then review):

1. **Make the beside slot a workspace, not a chat.** Add Terminal and Files tabs to `EmbeddedSessionChatContent` (`App.tsx:237-278`) from existing views — removes the "two agents, two terminals" deficit without building a pane tree.
2. **Hunk-level next/previous change (F7/Shift+F7).** Today `]`/`[`/`V` stop at file granularity; an index over the already-rendered hunks is small and matches Orca's reviewer locomotion.
3. **One progressive Stage→Commit→Push primary action**, composed from `CommitInput`/`SyncActions`, plus stage affordance in Branch scope — closes Orca's landing flow on a read-only surface.

1 + 2 is the plausible tie; 3 converts it.