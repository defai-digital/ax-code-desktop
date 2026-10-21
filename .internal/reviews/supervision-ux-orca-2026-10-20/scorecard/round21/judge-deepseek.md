## Method

Read-only source verification at HEAD `15f40f1d`; no shell, so no tests/journeys rerun. Uncommitted `config/`, lockfile and version pins excluded. Unknown competitor capabilities are not penalized.

| Surface (weight) | AX | Orca | opencode | Codex app | Claude Code |
|---|---:|---:|---:|---:|---:|
| Mission Control / overview (40%) | **9.30** | 9.00 | 6.80 | 8.20 | 8.70 |
| Workspace / layout (25%) | **9.20** | 9.05 | 6.90 | 8.30 | 8.90 |
| Review changes (35%) | **9.25** | 8.95 | 7.40 | 8.85 | 8.85 |

**Overview — vs Orca:** Counted, multi-select PR state and check facets with removable chips (`components/supervision/missionControl/MissionControlFilters.tsx:130-163`, `:250-267`) plus an inbox that also counts waiting browser pages (`components/supervision/NeedsYouPopover.tsx:64-65`) and rows naming the page a session's browser holds (`MissionControlRow.tsx:253-274`) make "what needs me" answerable from one point. Orca's dashboard, feed and badge coverage is comparably broad, so the edge is consolidation of decisions, not ambient signal. **vs opencode:** opencode has no multi-agent board and only per-session permission docks (`competitor-facts.md:19`, `:22`), so triage is structurally absent; AX's titlebar Activity feed with unread count (`components/supervision/ActivityButton.tsx:15-23`, `:46-49`) and stale-preview Retry with last-read age (`MissionControlRow.tsx:193-219`) serve scanning directly.

**Workspace — vs Orca:** One to four panes each hosting a full session, with drag swap/edge dock, announced arrow moves, split, pop-out and remembered ratios (`components/sessionGrid/SessionGrid.tsx:96-151`, `:303-320`, `:355-378`, `:437-465`; `lib/supervision/sessionGrid.ts:53`), plus a per-session WebMCP page with switcher, revoke and named capacity (`components/mcp/WebMcpPages.tsx:14-80`). Orca's panes host more tool types and split recursively, so its advantage is generality while AX's is supervision-oriented arrangement plus page ownership — a small AX edge. **vs opencode:** a timeline plus one resizable right panel with no split panes (`competitor-facts.md:22`) cannot show two agents at once.

**Review — vs Orca:** Landing from This session and Last turn applies only while the review mark, index before-blob, worktree after-blob and file mode still match (`components/views/git/ReviewLanding.tsx:77-91`), unreviewed files need a deliberate second click (`:116-130`), the rail is a collapsible, resizable tree (`ReviewFileRail.tsx:160-171`, `:280-328`), and the browser recap offers jump-to-step, durations and definition digests beside landing (`ReviewLandingBrowserEvidence.tsx:134-182`). Orca keeps inline three-way merge and an arbitrary compare base, which AX hands off; for safely landing agent work the content-bound action is the higher-impact half. **vs opencode:** its filterable tree, mode switches and comment chips are pleasant (`competitor-facts.md:23-25`), but there is no stage/commit control where the diff is reviewed.

**Round 21 delta:** One shared redaction module now backs previews, approval text, schemas, logs and the check corpus (`shared/webmcp-redaction.mjs:1-13`, `:175-209`; `components/chat/PermissionCard.tsx:3`; `stores/useWebMcpBrowserStore.ts:1`), with exact-definition diagnosis and bounded receipts (`stores/useWebMcpApprovalOutcome.ts:5-57`; `chat/message/parts/ToolPart-impl.tsx:1682`). This raises trust and consistency, not supervision breadth: +0.01 overall.

## Weighted overall

| Product | Overview .40 | Workspace .25 | Review .35 | Weighted |
|---|---:|---:|---:|---:|
| AX Code Desktop | 9.30 | 9.20 | 9.25 | **9.26** |
| Orca | 9.00 | 9.05 | 8.95 | **9.00** |
| Claude Code desktop | 8.70 | 8.90 | 8.85 | **8.80** |
| Codex app | 8.20 | 8.30 | 8.85 | **8.45** |
| opencode desktop | 6.80 | 6.90 | 7.40 | **7.04** |

**AX vs Orca: better** (+0.26).
**AX vs opencode: better** (+2.22).

AX is better than Orca, so no flip list is required. Residual Orca edges worth protecting the margin against: inline three-way merge, an arbitrary compare ref, and pane trees that host any tool type.