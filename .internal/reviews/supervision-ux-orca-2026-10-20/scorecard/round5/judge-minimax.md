All seven round-5 groups verified in source. Writing the judgment.

---

# Round 5 judgment (independent, read-only)

**Verification.** Every round-5 claim exists at HEAD: child rows with own state/age/Open (`MissionControlRow.tsx:280-313`, limit 3, needs-a-person-first `childSessions.ts:28-48`); feed with credential-filtered previews and 200-event cap (`activityFeed.ts:55-113`, `useActivityFeedStore.ts:63-93`, recorded once in the primary window `AppEffects.tsx:82`, unread count `MissionControlHeader.tsx:81-150`); never-opened previews with 2 concurrent reads, 20 s timeout race, 10 s floor, visible-row-safe eviction (`remoteActivityCache.ts:47-121`, mounted at `MissionControl.tsx:164`); beside pane widened to half the viewport and never narrowed (`openSessionBeside.ts:24-28`) with Chat/Changes tabs mounting `DiffView` (`App.tsx:237-278`); inline thread markers at re-anchored lines with Resolve (`PierreDiffViewer.tsx:219-226`, `PierreDiffCommentOverlays.tsx:190-202`); marks signing both sides (`useReviewProgressStore.ts:167-168`, used `SessionChangesView.tsx:274`) with a visible fallback warning (`ReviewFileRail.tsx:147,202-206`); remembered per-repository base validated against live branches (`useBranchReviewBaseStore.ts`, `BranchChangesView.tsx:153-176`). The journey now asserts **both** composers visible plus width ≥ 500 and the beside repository's diff (`supervision-workspace-webmcp.mjs:487-501`) — closing the verification gap round 4 codex named.

## 1. Per surface

| Surface | AX | Orca | opencode | Codex | Claude |
|---|---:|---:|---:|---:|---:|
| Mission Control / overview (40%) | **9.0** | 9.1 | 6.4 | 7.7 | 8.6 |
| Workspace / layout (25%) | **8.4** | 9.2 | 7.0 | 8.2 | 9.0 |
| Review changes (35%) | **8.7** | 8.9 | 7.3 | 8.7 | 8.8 |

**Overview, AX vs Orca.** Round 5 closed both edges round 4 named: child agents are real rows with their own state (`MissionControlRow.tsx:280-313`) and "what happened" is a persisted cross-session feed with unread and Mark all read (`MissionControlActivityFeed.tsx:52-98`). Orca still edges ahead because its feed is reachable outside the board — header bell, dock badge, working→idle notification (`competitor-facts.md:8`) — while AX's is a board column behind a toggle (`MissionControl.tsx:796`) with no search or filter, and Orca cards carry PR/MR state AX does not (`competitor-facts.md:7`).

**Overview, AX vs opencode.** AX is clearly ahead: a global *answerable* inbox plus a board, batch stop/archive and previews for sessions never opened collapse twenty sessions into one screen, while opencode has no board and only per-session prompt docks (`competitor-facts.md:21`).

**Workspace, AX vs Orca.** The beside unit is now genuinely comparable — two live composers, half the window, and the second session's own diff (`openSessionBeside.ts:24-28`, `App.tsx:266-277`), journey-verified. Orca remains a different class of surface: per-worktree pane trees with terminal/editor/browser/diff/PR and drag-to-split (`competitor-facts.md:12-13`), and AX still forces `activeMainTab` back to chat (`openSessionBeside.ts:31`), so two diffs or two terminals cannot coexist.

**Workspace, AX vs opencode.** AX wins on a second live session with review surface, tool breadth and resizable per-directory panels; opencode's titlebar session tabs with unread (`competitor-facts.md:20`) make plain switching cheaper, but it has no split panes at all.

**Review, AX vs Orca.** Threads are now pins in the diff, not only list entries, and marks bind both sides with a visible fallback — the trust bar matches Orca. Orca keeps inline 3-way merge, one-button Stage→Commit→Push and F7 change nav (`competitor-facts.md:14-16`); AX's Branch scope still takes no stage callbacks (`BranchChangesView.tsx:226-238`).

**Review, AX vs opencode.** AX wins decisively on staging, commit, five scopes, threads and image diffs; opencode's better file tree and turn undo/redo (`competitor-facts.md:23-25`) do not offset it.

## 2. Weighted

AX **8.75** · Orca **9.06** · Claude Code **8.77** · Codex **8.18** · opencode **6.87**

**AX vs Orca: worse** (−0.31, down from −0.55 to −0.96 across rounds)
**AX vs opencode: better**

## 3. Three smallest changes to flip Orca

1. **Make Branch scope landable.** Pass stage/unstage (per file, ideally per hunk) into `BranchChangesView` from the existing `GitView-impl.tsx` callbacks. This is the persona's (c) gap and Orca's one-button flow / Codex's per-hunk stage.
2. **Promote the feed to a global signal** — header bell + dock badge reusing the store that already computes unread (`MissionControlHeader.tsx:81-150`).
3. **Add a terminal/files tab to the embedded tablist** (`App.tsx:237-256`), reusing context-panel tools, so the second agent is more than chat plus one diff.

*(1) and (2) together plausibly close the gap; (3) is defensive.*