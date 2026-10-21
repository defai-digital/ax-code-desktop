## Round 20 scores (read-only source verification at HEAD `4b7f80db`)

| Surface (weight) | AX | Orca | opencode | Codex | Claude |
|---|---:|---:|---:|---:|---:|
| Mission Control / overview (40%) | **9.30** | 9.00 | 6.80 | 8.20 | 8.70 |
| Workspace / layout (25%) | **9.15** | 9.00 | 6.90 | 8.30 | 8.90 |
| Review changes (35%) | **9.25** | 8.90 | 7.30 | 8.85 | 8.85 |

**Overview — vs Orca:** PR state and checks are multi-select facets with per-value counts and removable chips (`components/supervision/missionControl/MissionControlFilters.tsx:130-163`, `:250-267`), stale previews carry a last-read age and an in-place Retry that does not select the row (`MissionControlRow.tsx:208-218`), and a row names the page its session's browser holds (`MissionControlRow.tsx:253-260`), with waiting pages counted into the inbox (`components/supervision/NeedsYouPopover.tsx:64-65`). Orca's cross-tab glyphs and worktree palette still give broader ambient signal per surface, but AX answers permissions, questions and waiting browser calls from one triage point, which is what this persona actually burns time on. **vs opencode:** opencode has no multi-agent board — only a home list plus per-session permission docks (`competitor-facts.md:19`, `:22`) — so "notice what needs me" is structurally absent rather than merely thinner.

**Workspace — vs Orca:** drag-to-swap or edge-dock with a rendered drop edge (`components/sessionGrid/SessionGrid.tsx:133-152`, `:414-429`), arrow moves that announce and follow focus (`:175-183`), an arbitrary split tree up to four panes (`:311-313`, `:465`), pop-out/pop-in with tracked window ownership (`:355-378`) and remembered ratios (`:440-450`), each pane hosting a full session (`:402`); the page switcher adds per-session revoke and named capacity (`components/mcp/WebMcpPages.tsx:18-45`, `:60-80`, `:123-131`). Orca's panes host any tool type rather than only sessions, so this stays a small AX edge. **vs opencode:** a timeline plus one resizable right panel with no split panes cannot show two agents at once, while AX shows four working sessions with their own Changes and Terminal.

**Review — vs Orca:** landing from This session and Last turn applies only while the mark, index before-blob, worktree after-blob and file mode still match (`components/views/git/ReviewLanding.tsx:77-91`), unreviewed files need a second explicit click (`:116-130`), staging and commit re-read status and the index identity (`:223-245`, `:253-284`), and the rail is a collapsible, resizable tree (`components/views/ReviewFileRail.tsx:169-171`, `:289-328`). Orca keeps inline three-way merge and an arbitrary compare ref (AX's `ConflictDialog.tsx:184-187` lists unmerged files but hands resolution off), yet AX binds the landing action to reviewed bytes and shows browser evidence beside it — the higher-impact half for safe landings. **vs opencode:** its file tree, mode switches and comment chips (`competitor-facts.md:23-25`) are pleasant, but there is no stage/commit control in review, so work cannot be landed where it was reviewed.

**Round 20 delta (verified, narrow):** ephemeral, redacted, bounded receipts now enrich completed permission-only calls (`stores/useWebMcpApprovalOutcome.ts:30-53`; merged in `components/chat/message/parts/ToolPart-impl.tsx:2046-2047`), diagnosis resolves only the exact definition owning the digest and says so when it cannot (`components/mcp/WebMcpCallDiagnosis.tsx:87-93`, `lib/webMcpDiagnosis.ts:227-237`), and a changed digest is flagged (`WebMcpCallDiagnosis.tsx:74-81`; also in the recap, `views/git/ReviewLandingBrowserEvidence.tsx:80-100`). This raises confidence in browser-using sessions, not supervision breadth — hence +0.05 on review only.

## Weighted overall

| Product | Overview .40 | Workspace .25 | Review .35 | Weighted |
|---|---:|---:|---:|---:|
| AX Code Desktop | 9.30 | 9.15 | 9.25 | **9.25** |
| Orca | 9.00 | 9.00 | 8.90 | **8.97** |
| Claude Code desktop | 8.70 | 8.90 | 8.85 | **8.80** |
| Codex app | 8.20 | 8.30 | 8.85 | **8.45** |
| opencode desktop | 6.80 | 6.90 | 7.30 | **7.00** |

**AX vs Orca: better** (+0.28).
**AX vs opencode: better** (+2.25).

Residual Orca edges, each below the margin: inline three-way merge, arbitrary compare ref, panes that host any tool. Method limits: read-only inspection only — no shell was available in this session, so no tests or journeys were rerun; uncommitted `config/`, lockfile and version pins were excluded.