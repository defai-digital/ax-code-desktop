## Independent UX Scorecard — Round 28 (HEAD `e36aad55`, read-only)

Verified in source at HEAD; competitor scores from `competitor-facts.md` only (unknowns not penalized). Uncommitted `config/`, lockfile and version pins ignored.

### 1. Per-surface scores

| Surface | AX | Orca | opencode | Codex app | Claude Code |
|---|---:|---:|---:|---:|---:|
| Mission Control / overview (40%) | **9.32** | 9.00 | 6.80 | 8.20 | 8.70 |
| Workspace / layout (25%) | **9.22** | 9.05 | 6.90 | 8.30 | 9.00 |
| Review changes (35%) | **9.32** | 8.95 | 7.50 | 8.85 | 8.85 |

**Overview — AX vs Orca.** Round 26's per-row waiting chip closes MiniMax's round-24 flip #1: a call blocked on the browser is now visible on the board, not only in the inbox (`components/supervision/missionControl/MissionControlRow.tsx:106-109`, `:283-286`), and counted multi-select PR-state and checks facets answer "what needs me" without opening rows (`MissionControlFilters.tsx:130-163`). Orca's kanban, cross-worktree feed and child rows remain a tighter glance; AX's edge is consolidated *decisions*, not scan density.

**Overview — AX vs opencode.** opencode has no board at all and only per-session permission docks (`competitor-facts.md:19`, `:22`); AX resolves permissions, questions and waiting pages in one inbox (`NeedsYouPopover.tsx:64`, `:121`) and shows stale previews with their own age plus a Retry that never selects the row (`MissionControlRow.tsx:82-87`, `:198-224`). Structurally a different product.

**Workspace — AX vs Orca.** Free arrangement is real: drag swap/edge dock with a free binary tree (`SessionGrid.tsx:143-153`; `lib/supervision/sessionGrid.ts:17-31`), arrow moves with focus following (`:176-184`), split, pop-out under one browser owner, remembered ratios. Two residues keep it level: the grid hosts *whole sessions*, not Orca's arbitrary mixed-tool pane trees, and it caps at four panes (`sessionGrid.ts:53`) — at 5-20 sessions that binds. Round 26's "page access in grid panes" is a header switcher only (`SessionGrid.tsx:289`), and clicking it navigates the current session (`useWebMcpPages.ts:42-44`); no page renders inside the pane.

**Workspace — AX vs opencode.** opencode is one timeline plus a resizable right panel, no splits (`competitor-facts.md:22`). AX shows four sessions at once with per-session Chat/Changes/Files/Terminal; ~+2.3 is not in play.

**Review — AX vs Orca.** Landing from This session and Last turn credits a file only while mark, index `before`, worktree `after` and file mode all still match (`ReviewLanding.tsx:77-91`), with a deliberate second click for unreviewed files (`:118-130`); the rail is a collapsible tree with drag and keyboard width (`ReviewFileRail.tsx:169`, `:289-327`, `:567-572`); round 27's masking of echoed sensitive values under any key (`shared/webmcp-redaction.mjs:31`, `:147`) keeps the browser evidence beside landing trustworthy. Orca still owns inline three-way merge and an arbitrary compare ref — AX's base is a branch `<select>` only (`BranchChangesView.tsx:399-408`).

**Review — AX vs opencode.** opencode's filterable tree, git/branch/turn modes and per-turn undo are good (`competitor-facts.md:23-25`); AX adds landing bound to reviewed bytes and mode. Its absent commit controls are inference, left unscored.

### 2. Weighted overall

| Product | Overview | Workspace | Review | Weighted |
|---|---:|---:|---:|---:|
| **AX Code Desktop** | 9.32 | 9.22 | 9.32 | **9.30** |
| Orca | 9.00 | 9.05 | 8.95 | 9.00 |
| Claude Code desktop | 8.70 | 9.00 | 8.85 | 8.83 |
| Codex app | 8.20 | 8.30 | 8.85 | 8.45 |
| opencode desktop | 6.80 | 6.90 | 7.50 | 7.07 |

Rounds 25-28 are almost entirely WebMCP redaction and browser-lifecycle hardening. That raises trust in existing surfaces without adding supervision breadth, so the gain over round 24 is +0.03 — the waiting chip is real but small.

**AX vs Orca: better** (+0.30)
**AX vs opencode: better** (+2.23)

### 3. Protecting the margin

Not a flip list (AX is ahead), but three Orca edges remain and any one could erode it: inline three-way merge (surface the hunks `ConflictDialog` already fetches), an arbitrary compare ref (a free-text option on `baseChoice`), and grid panes that host any tool rather than a whole session.