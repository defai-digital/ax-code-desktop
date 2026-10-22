## Independent UX scorecard, round 27 — final (read-only; HEAD `1442693e`)

**Method.** Verified in source only; no shell was available this session, so no test or journey was rerun. Every AX claim cites a line I read. Uncommitted `config/`, lockfile and version pins ignored.

### 1. Per-surface scores

| Surface (weight) | AX | Orca | opencode | Codex | Claude |
|---|---:|---:|---:|---:|---:|
| Mission Control / overview (.40) | **9.30** | 9.00 | 6.80 | 8.20 | 8.70 |
| Workspace / layout (.25) | **9.20** | 9.05 | 6.90 | 8.30 | 8.90 |
| Review changes (.35) | **9.25** | 8.95 | 7.40 | 8.85 | 8.85 |

**Overview — AX vs Orca.** Rows settle "what needs me" without opening anything: stale preview with last-read age and a Retry that does not select the row (`missionControl/MissionControlRow.tsx:198-224`), the round-26 waiting-page chip (`:283-286`), page/origin chips (`:258-282`), and multi-select PR-state plus checks facets with counts (`MissionControlFilters.tsx:118-134`, `:250-267`). Orca still leads on ambient signal (cross-worktree feed, date buckets, badge consistency); AX's edge is consolidated decisions plus supervision-only evidence, so it is real but not large.
**Overview — AX vs opencode.** No multi-agent board and only per-session permission docks (`competitor-facts.md:19,22`); AX's triage inbox, Activity feed and facets have no counterpart.

**Workspace — AX vs Orca.** Round 26 added page access inside grid panes (`sessionGrid/SessionGrid.tsx:289`) on top of drag swap/edge dock, arrow moves with focus, split, pop-out and remembered ratios (`:168-171`, `:248-258`, `:303-322`, `:356-379`, `:435-465`). Orca's pane tree still hosts any tool type and splits recursively, so AX leads on supervised sessions, not on tool generality — parity, not dominance.
**Workspace — AX vs opencode.** A single resizable right panel with no split panes (`competitor-facts.md:22`) cannot show two agents at once; AX shows four, each a full session.

**Review — AX vs Orca.** Landing from This session/Last turn is bound to reviewed bytes and mode: index holds `before` under a regular mode, worktree holds `after`, modes equal (`git/ReviewLanding.tsx:77-91`), unreviewed files need a second explicit click (`:116-130`), and the commit preflight re-reads and compares index identity (`:252-284`). The rail is a collapsible tree with drag and keyboard width plus open-in-editor (`ReviewFileRail.tsx:99-105`, `:160-200`, `:279-328`, `:172`); comments go to any live session of the project (`DiffCommentSummaryBar.tsx:49-74`); threads re-anchor and resolve (`lib/reanchorThread.ts`, `ReviewThreadList.tsx:56-72`); F7 walks change hunks in the rebindable registry (`hooks/useReviewHunkKeys.ts:49-52`, `lib/shortcuts.ts:461-472`). Orca keeps inline three-way merge and an arbitrary compare ref, so AX wins on safely landing agent work rather than on every comparison tool.
**Review — AX vs opencode.** Its filterable tree, mode switch and comment chips are pleasant (`competitor-facts.md:23-25`), but there is no stage/commit where the diff is reviewed; AX binds the landing action to reviewed content and mode.

**WebMCP (counted within the surfaces).** Multi-session pages with switcher, per-session revoke, named capacity and owner-window focus (`mcp/WebMcpPages.tsx:17-102`); waiting pages in Needs you, Mission Control and grid panes (`:206-216`, `MissionControlRow.tsx:283`, `SessionGrid.tsx:289`); tool panel with schemas, hints, lint, registration timeline and Try-it (`mcp/WebMcpToolPanel.tsx:428-448`, `:915-1004`); property-level schema diffs (`:4`); headless checker (`scripts/webmcp-check.mjs`). Orca has no page-tool concept (`competitor-facts.md:3-16`) — this is unshared capability, not counting a competitor's unknown as a weakness.

**Rounds 24→27 delta.** Round 26 (waiting chip, in-pane page access) plus rounds 22-24 lifecycle/redaction hardening raised trust and consistency; supervision breadth grew only slightly, so overview and workspace gain 0.05 each, no more.

### 2. Weighted overall

| Product | Overview .40 | Workspace .25 | Review .35 | Weighted |
|---|---:|---:|---:|---:|
| AX Code Desktop | 9.30 | 9.20 | 9.25 | **9.26** |
| Orca | 9.00 | 9.05 | 8.95 | **9.00** |
| Claude Code desktop | 8.70 | 8.90 | 8.85 | **8.80** |
| Codex app | 8.20 | 8.30 | 8.85 | **8.45** |
| opencode desktop | 6.80 | 6.90 | 7.40 | **7.04** |

**AX vs Orca: better** (+0.26).
**AX vs opencode: better** (+2.22).

### 3. Flip list

Not required — AX leads both. Margin-protecting, smallest first: inline three-way merge (`ConflictDialog.tsx` still hands conflicts to a session), an arbitrary compare ref beside the Branch base, and a grid pane that can host one tool instead of a whole session.