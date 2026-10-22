All claims verified in source. Round 25's delta from round 24 is a test-only commit (`0fb2203e`), so supervision breadth is unchanged; I found two corrections to the round-24 record along the way.

## Round 25 judgment (read-only, HEAD `0fb2203e`)

No shell in this turn, so no tests/journeys were rerun; every AX claim below is a file:line I read. Paths are relative to `desktop/packages/ui/src/`. Uncommitted `config/`, lockfile and version pins ignored per brief.

**Correction to round 24's record.** Two of the four round-24 judges state a hole I could not reproduce: (a) "no per-row *waiting call* signal" and (b) "the session grid has no WebMCP surface at all." Both are wrong. `pageAccess` maps `waiting` and `interrupted` to their own states (`hooks/useWebMcpPages.ts:11-12`), `WebMcpSessionPage` renders that label on the row (`components/mcp/WebMcpPages.tsx:176-195`, mounted at `MissionControlRow.tsx:253`), and the same component is mounted in every grid pane (`components/sessionGrid/SessionGrid.tsx:288`). MiniMax's +0.19 is a false deficit, so I do not carry it forward.

### 1. Per-surface scores

| Surface | AX | Orca | opencode | Codex app | Claude Code |
|---|---:|---:|---:|---:|---:|
| Mission Control / overview (40%) | **9.32** | 9.00 | 6.80 | 8.20 | 8.70 |
| Workspace / layout (25%) | **9.26** | 9.02 | 6.90 | 8.30 | 8.95 |
| Review changes (35%) | **9.27** | 8.92 | 7.45 | 8.85 | 8.85 |

**Overview — AX vs Orca.** AX consolidates *decisions* where Orca consolidates *ambient signal*: counted multi-select PR-state and checks facets with removable chips (`MissionControlFilters.tsx:130-159`, `:250-268`) and an inbox that counts waiting browser pages (`NeedsYouPopover.tsx:64-65`, `:121`). Orca's kanban, cross-worktree feed, child rows and jump palette remain excellent, so the edge is narrow and worth no more than a few tenths.

**Overview — AX vs opencode.** opencode has no multi-agent board and only per-session permission docks (`competitor-facts.md:19`, `:22`), leaving triage structurally absent. AX rows carry session-bound page, branch, PR, checks, runtime goal budget and a stale preview stating its own age with a Retry that never selects the row (`MissionControlRow.tsx:81-87`, `:193-219`, `:253-286`) — this is the persona's "understand what each agent is doing" loop, and it is not close.

**Workspace — AX vs Orca.** The grid is a genuine free binary tree: center-swap, edge-dock and split with per-node ratios (`lib/supervision/sessionGrid.ts:419-470`), drag/arrow movement with focus following, capped at four (`sessionGrid.ts:53`, `:462-464`), and the palette matches Orca item-for-item on `#123`/`#PR`, Tab scope and Shift+Enter split-open (`CommandPalette.tsx:829-838`). Orca still retains recursive pane *trees* that host any tool type rather than a whole session, which is why I do not give parity.

**Workspace — AX vs opencode.** opencode is one timeline plus a resizable right panel with no split panes (`competitor-facts.md:22`). AX shows four full sessions at once, each with Chat/Changes/Files/Terminal plus its own WebMCP page and revoke control (`WebMcpPages.tsx:14-80`).

**Review — AX vs Orca.** AX wins on *landing* agent work rather than on comparison tooling: a session file counts as reviewed only while the mark, index `before` blob, worktree `after` blob and file mode all still match, falling back to an explicit "Stage all" click (`views/git/ReviewLanding.tsx:77-91`, `:116-130`), with a browser recap beside landing carrying durations, definition digests and per-property rejections (`views/git/ReviewLandingBrowserEvidence.tsx:79-98`). Orca retains inline three-way merge — `ConflictDialog.tsx:145-182` only delegates to an agent; a tree-wide grep for `three-way|threeWay|ours.*theirs` returns nothing — and an arbitrary compare base, since AX's selector is a branch-list `<select>` (`views/BranchChangesView.tsx:261-265`, `:399-411`).

**Review — AX vs opencode.** opencode's filterable tree, git/branch/turn modes and per-turn undo are pleasant and real (`competitor-facts.md:23-25`). AX adds what the persona's (c) requires: content-and-mode-bound landing from This session and Last turn, and a collapsible rail with pointer and keyboard width (`ReviewFileRail.tsx:290-293`, `:324-327`, `:564-573`). Its note that opencode lacks stage/commit is flagged inference, so I score neither way.

**Versus round 24.** The only commit since is a test change (`0fb2203e`), and supervision breadth did not move; my uplift comes from correcting the round-24 record, not from new code. Receipts remain in-memory, capped at 256 (`stores/useWebMcpApprovalOutcome.ts:14`, `:56`).

### 2. Weighted overall (overview 40%, review 35%, workspace 25%)

| Product | Overview | Workspace | Review | Weighted |
|---|---:|---:|---:|---:|
| **AX Code Desktop** | 9.32 | 9.26 | 9.27 | **9.29** |
| Orca | 9.00 | 9.02 | 8.92 | **8.98** |
| Claude Code desktop | 8.70 | 8.95 | 8.85 | **8.82** |
| Codex app | 8.20 | 8.30 | 8.85 | **8.42** |
| opencode desktop | 6.80 | 6.90 | 7.45 | **7.02** |

**AX vs Orca: better** (+0.31, just over the PRD's 0.2 margin).
**AX vs opencode: better** (+2.27).

### 3. Smallest changes that would most threaten that verdict

1. **Inline three-way merge** — `ConflictDialog.tsx` already fetches conflict details; only the three-way editor is missing. This is Orca's clearest tool edge.
2. **Free-text compare base** — `baseChoice` is already state plus a remembered default (`BranchChangesView.tsx:159`, `:287`); a ref field turns a fixed base into an arbitrary one.
3. **Persistent approval receipts** — receipts die at 256 in memory (`useWebMcpApprovalOutcome.ts:56`); surviving a restart would matter to a supervisor landing work days later.