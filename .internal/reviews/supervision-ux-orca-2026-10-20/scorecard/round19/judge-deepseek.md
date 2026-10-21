I verified the round 19 hardening and the round 15–19 surfaces in source at HEAD `f06cea02`; all citations below are paths I read.

## Round 19 scores

| Surface (weight) | AX | Orca | opencode | Codex | Claude |
|---|---:|---:|---:|---:|---:|
| Mission Control / overview (40%) | **9.30** | 9.00 | 6.80 | 8.20 | 8.70 |
| Workspace / layout (25%) | **9.15** | 9.00 | 6.90 | 8.30 | 8.90 |
| Review changes (35%) | **9.20** | 8.90 | 7.30 | 8.85 | 8.85 |

**Overview — vs Orca:** PR state and CI-check facets are multi-select with per-value counts and removable chips (`components/supervision/missionControl/MissionControlFilters.tsx:130-163`, `:250-267`), and stale previews carry their age plus an in-place Retry that does not select the row (`MissionControlRow.tsx:193-219`). Orca's shared glyphs and cross-tab feed remain broader ambient signal, but AX answers permissions, batched decisions and waiting browser calls from one inbox (`NeedsYouPopover.tsx:64-65`). **vs opencode:** opencode has no multi-agent board and only per-session permission docks, so "notice and answer" is structurally absent; AX also searches PRs by `#123`/`#PR`, scopes by host or project and opens beside (`CommandPalette.tsx:677-708`, `:829-835`, `:892-901`).

**Workspace — vs Orca:** drag to swap or dock on an edge, arrow moves with a polite announcement, an arbitrary split tree and reconciled multi-window tracking are real (`components/sessionGrid/SessionGrid.tsx:133-152`, `:167-183`, `:114-117`), and the page switcher holds per-session revoke plus named capacity (`components/mcp/WebMcpPages.tsx:18-45`, `:60-80`). Orca's panes can host any tool rather than sessions only, so I call this a small AX edge, not a rout. **vs opencode:** opencode is a timeline plus one resizable right panel with no split panes, while AX runs up to four complete sessions, each with Chat/Changes/Files/Terminal, plus approval cards that show the page's own definition and full description (`components/chat/WebMcpApprovalToolInfo.tsx:56-82`).

**Review — vs Orca:** landing from This session and Last turn stages only while the mark, index before-blob, worktree after-blob and file mode still match, and unreviewed files need a second explicit click (`components/views/git/ReviewLanding.tsx:77-91`, `:104-130`); the rail is a collapsible, width-adjustable tree (`ReviewFileRail.tsx:160-171`, `:191-201`). Orca keeps inline three-way merge and an arbitrary compare ref; AX hands conflicts to a session. **vs opencode:** opencode's comments-as-chips and turn undo are useful, but its review panel offers no stage/commit control, so work cannot be landed where it was reviewed, whereas AX exposes the full guarded flow (`ReviewLanding.tsx:116-134`).

**Round 19 delta (verified, small):** tool identity is now the native `invocationID:definitionDigest` pair (`lib/webMcpCatalog.ts:103-104`) and keys the tool row (`WebMcpToolPanel.tsx:1116`), so an unknown call association no longer renders as "not called" (`:314-319`); schema-derived text keeps property sensitivity through display and property diffs (`shared/webmcp-redaction.mjs:159-166`, `:169`; `lib/webMcpPropertyDiff.ts:10-13`). This raises review-reliability confidence slightly, not supervision breadth.

## Weighted overall

| Product | Overview .40 | Workspace .25 | Review .35 | Weighted |
|---|---:|---:|---:|---:|
| AX Code Desktop | 9.30 | 9.15 | 9.20 | **9.23** |
| Orca | 9.00 | 9.00 | 8.90 | **8.97** |
| Claude Code desktop | 8.70 | 8.90 | 8.85 | **8.80** |
| Codex app | 8.20 | 8.30 | 8.85 | **8.45** |
| opencode desktop | 6.80 | 6.90 | 7.30 | **7.00** |

**AX vs Orca: better** (+0.26).
**AX vs opencode: better** (+2.23).

Residual Orca edges, each smaller than the margin: inline three-way merge, an arbitrary compare ref (AX offers a remembered selectable Branch base), and panes that host any tool. Method limits: read-only source verification at `f06cea02`; no journeys rerun, and the uncommitted runtime pin was excluded as instructed.