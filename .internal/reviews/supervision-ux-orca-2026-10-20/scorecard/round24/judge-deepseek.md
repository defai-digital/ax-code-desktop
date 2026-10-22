## Method

Read-only source verification at HEAD `5193b0c8`. No shell available, so no tests or journeys were rerun; every AX claim below is a file:line I read. Uncommitted `config/`, lockfile and version pins ignored.

## 1. Surface scores

| Surface (weight) | AX | Orca | opencode | Codex app | Claude Code |
|---|---:|---:|---:|---:|---:|
| Mission Control / overview (.40) | **9.30** | 9.00 | 6.80 | 8.20 | 8.70 |
| Workspace / layout (.25) | **9.15** | 9.05 | 6.90 | 8.30 | 8.90 |
| Review changes (.35) | **9.25** | 8.95 | 7.40 | 8.85 | 8.85 |

**Overview — vs Orca.** Counted, multi-select PR state and checks facets (`components/supervision/missionControl/MissionControlFilters.tsx:118-133`, `:250-267`), an inbox that also counts waiting browser pages (`components/supervision/NeedsYouPopover.tsx:64-65`) and rows naming the page a session holds (`MissionControlRow.tsx:253-274`) make "what needs me" answerable in one place, and rows carry runtime checks plus goal budget Orca cannot project. Orca matches breadth with kanban, feed and badges, so the edge is consolidated *decisions*, not ambient signal.
**vs opencode.** No multi-agent board and only per-session permission docks (`competitor-facts.md:19`, `:22`) leave triage structurally absent; AX adds an unread Activity feed (`ActivityButton.tsx:22-23`) and stale previews with Retry plus last-read age (`MissionControlRow.tsx:193-219`).

**Workspace — vs Orca.** One to four panes each hosting a full session with drag swap/edge dock, arrow moves, split, pop-out under one browser owner and remembered ratios (`sessionGrid/SessionGrid.tsx:168`, `:248-255`, `:360-362`, `:437-465`), plus per-session WebMCP pages with switcher, per-session revoke and named capacity (`mcp/WebMcpPages.tsx:14-80`). Orca's pane trees still host more tool types and split recursively, so the residue is generality versus supervision-specific arrangement.
**vs opencode.** A single resizable right panel with no split panes (`competitor-facts.md:22`) cannot show two agents at once; AX shows four.

**Review — vs Orca.** Landing from This session and Last turn applies only while the mark, index before-blob, worktree after-blob and file mode still match (`views/git/ReviewLanding.tsx:77-91`), unreviewed files need a deliberate second click (`:116-130`), the rail is a collapsible tree with drag and keyboard width (`ReviewFileRail.tsx:160-200`, `:279-328`), and comments go to a chosen live session (`DiffCommentSummaryBar.tsx:50-66`). Orca still owns inline three-way merge and an arbitrary compare base, so AX wins on safely landing agent work rather than on every comparison tool.
**vs opencode.** Its filterable tree, mode switch and comment chips are pleasant (`competitor-facts.md:23-25`), but there is no stage/commit where the diff is reviewed (inference), and AX binds the landing action to reviewed bytes.

**Rounds 21→24 delta.** Rounds 22-24 hardened WebMCP redaction (`shared/webmcp-redaction.mjs`) and browser lifecycle (owner-window Focus, `WebMcpPages.tsx:82-98`): trust and consistency improved, supervision breadth did not, so I add no uplift over round 21.

## 2. Weighted overall

| Product | Overview .40 | Workspace .25 | Review .35 | Weighted |
|---|---:|---:|---:|---:|
| AX Code Desktop | 9.30 | 9.15 | 9.25 | **9.25** |
| Orca | 9.00 | 9.05 | 8.95 | **9.00** |
| Claude Code desktop | 8.70 | 8.90 | 8.85 | **8.80** |
| Codex app | 8.20 | 8.30 | 8.85 | **8.45** |
| opencode desktop | 6.80 | 6.90 | 7.40 | **7.04** |

**AX vs Orca: better** (+0.25).
**AX vs opencode: better** (+2.21).

## 3. Flip list

Not required: AX is better than Orca. Residual Orca edges worth protecting the margin against: inline three-way merge, an arbitrary compare ref, and pane trees that host any tool type rather than a whole session.