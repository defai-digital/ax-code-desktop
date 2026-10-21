## 1. Surface scores

| Surface (weight) | AX | Orca | opencode | Codex | Claude |
|---|---|---|---|---|---|
| Mission Control / overview (40%) | **9.3** | 9.0 | 6.8 | 8.2 | 8.7 |
| Workspace / layout (25%) | **9.15** | 9.0 | 6.9 | 8.3 | 8.9 |
| Review changes (35%) | **9.15** | 8.9 | 7.3 | 8.85 | 8.85 |

**Overview — vs Orca:** AX now narrows work by PR state and check outcome with counts that follow the other filters (`MissionControlFilters.tsx:130-163`), resolves `#123`/`#PR` and scopes by host or project in the palette (`CommandPalette.tsx:677-699`), and marks a preview stale with its last-read age and an in-place Retry (`en.ts:3479-3482`). Orca's card feed and shared glyphs are still slightly richer, but AX answers permissions and questions from the board, the peek (`MissionControlPeek.tsx:177`) and the badge, with Activity reachable from the titlebar (`en.ts:3610`). **vs opencode:** opencode has no multi-agent board and only per-session permission docks, so noticing-and-answering is absent rather than weaker.

**Workspace — vs Orca:** The grid drags to swap or dock on an edge, moves by arrow with focus following, splits to four, pops out under one browser owner and remembers ratios (`SessionGrid.tsx:118-166`, `:251-259`, `:302-321`, `:355-378`; `sessionGridPreferences.ts:29-53`), and each pane keeps its own WebMCP page with revoke and named capacity (`WebMcpPages.tsx:14-62`) — a page-tool concept Orca's browser pane lacks. Orca's recursive pane tree (any tool per pane) is still more general, so I call this parity, not a lead. **vs opencode:** opencode is a timeline plus one right panel with no split panes, while AX runs four complete sessions with their own Chat/Changes/Files/Terminal.

**Review — vs Orca:** Landing from This session and Last turn stages only content whose reviewed mark, index before-blob, worktree after-blob and file mode still match (`ReviewLanding.tsx:75-91`, `:104-115`; used at `SessionChangesView.tsx:420`); the rail is a collapsible tree with adjustable width (`ReviewFileRail.tsx:160-171`, `:191-199`) and threads re-anchor and resolve (`en.ts:1414-1428`). Orca still owns inline three-way merge and an arbitrary compare base, so AX leads on landing safety, not diff tooling. **vs opencode:** opencode offers comments-as-chips and turn undo but no stage/commit control, so a change cannot be landed where it was reviewed.

**WebMCP (folded into workspace and review):** Approval cards verify the page's own definition digest and say when it may differ (`WebMcpApprovalToolInfo.tsx:25-58`); the landing recap lists each browser step with duration, outcome, definition identity, jump-to-step and a whole-turn copy (`ReviewLandingBrowserEvidence.tsx:96-118`, `:148-190`); sign-in waiting, Sign out and an unsaved-work confirmation guard exist (`EmbeddedWebMcpBrowser.tsx:89`, `:460`), with redaction applied throughout. These raise trust in what a session did; I credited no surface breadth beyond source I read.

## 2. Weighted overall

| Product | Overview .40 | Workspace .25 | Review .35 | Weighted |
|---|---|---|---|---|
| AX Code Desktop | 9.30 | 9.15 | 9.15 | **9.21** |
| Orca | 9.00 | 9.00 | 8.90 | **8.97** |
| Claude Code desktop | 8.70 | 8.90 | 8.85 | **8.80** |
| Codex app | 8.20 | 8.30 | 8.85 | **8.45** |
| opencode desktop | 6.80 | 6.90 | 7.30 | **7.00** |

**AX vs Orca: better** (+0.24; overview facets/palette plus content-bound landing carry it, workspace is a tie).
**AX vs opencode: better** (+2.21).

## 3. Flip list

Not required. Residual Orca edges, worth less than the margin for this persona: inline three-way merge (conflicts still go to a session), an arbitrary compare ref (only a selectable Branch base exists), and a recursive pane tree. Two WebMCP P2s remain and cost nothing here: a credential-shaped tool name cannot be tried by hand, and approval descriptions are capped at 200 characters.