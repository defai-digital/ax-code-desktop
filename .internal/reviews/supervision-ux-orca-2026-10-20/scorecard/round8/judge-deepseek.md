# Independent UX judgment, rounds 6-8 (AX read at HEAD; competitor facts only)

| Surface (weight) | AX | Orca | opencode | Codex | Claude |
|---|---:|---:|---:|---:|---:|
| Mission Control / overview (40%) | **9.1** | 9.1 | 6.5 | 7.8 | 8.6 |
| Workspace / layout (25%) | **8.9** | 9.0 | 7.0 | 8.2 | 9.0 |
| Review changes (35%) | **8.9** | 8.9 | 7.4 | 8.8 | 8.8 |

**Overview — vs Orca.** AX now clears blockers without opening sessions: same-permission requests get one armed allow-once/deny with no standing grant (`PermissionBatchBar.tsx:22-27`), and rows carry the runtime's verification counts and remaining budget (`MissionControlRow.tsx:241-242`). Orca still has the better ambient channel (header bell, dock badge, working→idle notification) and PR/MR state on cards, while AX's feed stays a board column and its browser chip (`MissionControlRow.tsx:213`) is useful but narrow.

**Overview — vs opencode.** opencode's only notice mechanism is a per-session permission dock, so twenty sessions cost twenty inspections. AX's board, answerable inbox and never-opened previews are a category apart.

**Workspace — vs Orca.** AX now shows one to four full session workspaces with pointer/keyboard splitters, per-window restore, and each pane's own Chat/Changes/Files/Terminal (`SessionGrid.tsx:53-95`, `:184-203`, `useUIStore-impl.ts:871-876`, `App.tsx:93`). Orca's per-worktree pane trees, drag-to-split and pane pop-out still beat AX's fixed 1/2/3/4 layouts; AX's page tools with "Try it" (`WebMcpToolPanel.tsx:191-211`) and revoked-grant pause/resume (`desktop-webmcp-browser.js:119-123`) exceed Orca's browser pane, which has no page-tool concept.

**Workspace — vs opencode.** opencode documents no split panes, while AX shows four live sessions each with files, terminal and review. opencode's titlebar unread tabs remain a cheaper single-session switch.

**Review — vs Orca.** AX landed the two round-5 flips: progressive Stage→Commit→Push that re-reads status before staging/committing and pins the displayed upstream (`ReviewLanding.tsx:119-131`, `landingActions.ts:57-61`), plus registered F7/Shift+F7 hunk navigation (`shortcuts.ts:460-468`, `useReviewHunkKeys.ts:49-52`). Orca still has inline 3-way merge, and AX's landing is absent from Branch and session scopes (`DiffView.tsx:2077`), so this is parity rather than a lead.

**Review — vs opencode.** AX has staging, hunk actions, six scopes, re-anchored resolving threads and image diffs; opencode's review is read-and-comment, with no documented commit path. opencode's filterable tree and turn undo/redo are locally nicer but do not offset landing.

**Weighted overall** (40/35/25): AX **8.98** · Orca **9.01** · Claude **8.77** · Codex **8.25** · opencode **6.94**.

**AX vs Orca: equal** (Orca +0.03, inside the judges' ~0.1 spread; AX still misses the PRD's 0.2 margin).  
**AX vs opencode: better.**

WebMCP credit is real but confined: approvals name target, submit flag and redacted text and withhold "Always allow" without a scope (`PermissionCard.tsx:193-198`, `:414-437`), and access start/stop reaches the feed (`browserActivity.ts:28-56`). Windows CI remains unproven: the harness hung after rendering correctly and the fix has not been re-run (`README.md:207-209`).

**Three smallest changes most likely to flip it**

1. Extend `ReviewLanding` to Branch and session scopes, reusing the existing stage/commit callbacks and scoped file list (CS-14). This closes the only remaining landing gap (`DiffView.tsx:2077`) and directly serves "review and land safely".
2. Show the session's verification envelopes beside the landing action using `verificationEvidence.ts`, warning when checks are stale or failing. It makes landing evidence-backed in a way Orca cannot match, without inventing data.
3. Promote the Activity feed to a header bell using its existing unread count, so "what changed while I was away" is reachable without opening the board. This matches Orca's alerting reach at low cost.