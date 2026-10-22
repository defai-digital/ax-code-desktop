## Method
Read-only at HEAD `96f74a34`; this session has no shell, so no tests or journeys were rerun. Every AX claim below is a file:line I read. Uncommitted `config/`, lockfile and version pins ignored.

## 1. Surface scores

| Surface (weight) | AX | Orca | opencode | Codex app | Claude Code |
|---|---:|---:|---:|---:|---:|
| Mission Control / overview (.40) | **9.32** | 9.00 | 6.80 | 8.20 | 8.70 |
| Workspace / layout (.25) | **9.20** | 9.05 | 6.90 | 8.30 | 8.90 |
| Review changes (.35) | **9.25** | 8.95 | 7.40 | 8.85 | 8.85 |

**Overview — vs Orca.** A row now answers "why does this need me" three ways at once: the waiting-page chip (`MissionControlRow.tsx:283-286`), the browser-origin chip (`:259-282`) and an inbox that already counts waiting pages (`NeedsYouPopover.tsx:64-65`, `:121`), on top of multi-select PR state and checks facets with counts (`MissionControlFilters.tsx:132-160`) and stale previews with age and Retry (`MissionControlRow.tsx:82-87`, `:198-224`). Orca matches breadth with kanban, feed and badges, so the edge is consolidated triage, not ambient signal.
**vs opencode.** Per-session permission docks and no multi-agent board (`competitor-facts.md:19`, `:22`) leave triage structurally absent, where AX answers from Needs You and reaches the unread feed from the titlebar (`ActivityButton.tsx:22-23`).

**Workspace — vs Orca.** Four panes each hosting a whole session — drag hit-testing with edge docking (`SessionGrid.tsx:120-153`), arrow moves with focus following (`:176-184`, `:252-260`), split to four (`:233`, `:303-316`) — and each pane now keeps that session's own page switcher (`:289`), with per-session revoke and named capacity (`WebMcpPages.tsx:19-25`, `:61-63`, `:128-138`). Orca's pane trees host more tool kinds and split recursively (`competitor-facts.md:12`), so the residue is generality versus supervision-specific arrangement.
**vs opencode.** A single resizable right panel with no split panes (`competitor-facts.md:22`) cannot show two agents at once; AX shows four with per-pane page access, which has no opencode analogue.

**Review — vs Orca.** Landing from This session and Last turn applies only while the mark, index before-blob, worktree after-blob and file mode still match (`ReviewLanding.tsx:77-91`), unreviewed files need a second explicit click (`:116-130`), the rail is a collapsible tree with drag and keyboard width (`ReviewFileRail.tsx:270-327`, `:562-570`), and comments go to a chosen live session of the same project (`DiffCommentSummaryBar.tsx:50-75`). Orca still owns inline three-way merge (`competitor-facts.md:13`), so AX leads on safely landing agent work rather than on comparison breadth.
**vs opencode.** Its filterable tree, mode switch and comment chips are pleasant (`competitor-facts.md:23-25`), but staging and committing inside review are absent (inference), so AX's content-bound landing action has no counterpart.

**Rounds 24→26 delta.** The waiting-page chip and per-pane page switcher add real triage and visibility; collapsed-row failure reasons (`ToolPart-impl.tsx:1886-1888`) and off-list replay values kept visible and confirmed (`WebMcpToolPanel.tsx:361`, `:375`) add honesty, not breadth. Uplift limited to overview +0.02 and workspace +0.05.

## 2. Weighted overall

| Product | Overview .40 | Workspace .25 | Review .35 | Weighted |
|---|---:|---:|---:|---:|
| AX Code Desktop | 9.32 | 9.20 | 9.25 | **9.27** |
| Orca | 9.00 | 9.05 | 8.95 | **9.00** |
| Claude Code desktop | 8.70 | 8.90 | 8.85 | **8.80** |
| Codex app | 8.20 | 8.30 | 8.85 | **8.45** |
| opencode desktop | 6.80 | 6.90 | 7.40 | **7.04** |

**AX vs Orca: better** (+0.27).
**AX vs opencode: better** (+2.23).

## 3. Flip list
Not required. Residual Orca edges to guard the margin against: inline three-way merge, an arbitrary compare ref (I found only merge-base comparison, `ReviewLanding.tsx:68-72`), and pane trees that host any tool type instead of a whole session.