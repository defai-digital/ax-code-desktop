# Round 26 UX Scorecard — judge-codex (independent, read-only)

Method: source verification at HEAD `96f74a34`. No shell in this session, so no test or journey run; every AX claim is a `path:line` I read. Uncommitted `config/`, lockfile and version pins ignored.

## 1. Per-surface scores

| Surface | AX | Orca | opencode | Codex app | Claude Code |
|---|---:|---:|---:|---:|---:|
| Mission Control / overview (.40) | **9.35** | 9.00 | 6.80 | 8.20 | 8.70 |
| Workspace / layout (.25) | **9.22** | 9.00 | 6.90 | 8.30 | 9.00 |
| Review changes (.35) | **9.30** | 8.90 | 7.50 | 8.85 | 8.85 |

**Overview — vs Orca.** Round 26 closes the one hole round 24's MiniMax judge named: a per-row waiting-page chip (`MissionControlRow.tsx:106-109`, `:283-286`) on the same `webMcpPageNeedsYou` rule Needs you uses (`webMcpViewKey.ts:24`), with a test proving the click navigates without selecting the row (`WebMcpPages.test.tsx:224-247`). On top of counted multi-select PR-state and checks facets (`MissionControlFilters.tsx:118-159`, `:250-268`), runtime checks beside landing (`ReviewLandingChecks.tsx:31-42`) and stale previews with Retry and last-read age (`MissionControlRow.tsx:198-225`), a blocked browser call is now visible without leaving the board — the consolidation advantage over Orca's ambient signal is real.
**vs opencode.** No multi-agent board and per-session permission docks only (`competitor-facts.md:19`, `:22`) make triage structurally absent; AX's Needs you merges requests, status rows and waiting pages in one list (`NeedsYouPopover.tsx:59-65`).

**Workspace — vs Orca.** Free-arrangement binary tree with drag swap/edge dock, arrow moves with following focus, per-split splitters and remembered ratios (`sessionGrid.ts:53`, `:220-238`; `SessionGrid.tsx:255-322`, `:454-470`), plus per-pane page access (`SessionGrid.tsx:289`). The pane's embedded realm still hosts only chat/changes/files/terminal (`App.tsx:93`, `:261-280`) — the WebMCP switcher navigates the *main window's* context browser (`useWebMcpPages.ts:42-56`), so the grid still trails Orca's recursive mixed-tool pane trees and4-slot ceiling.
**vs opencode.** One unsplit right panel (`competitor-facts.md:22`); AX shows four whole sessions.

**Review — vs Orca.** Landing from This session/Last turn applies only while mark, index before-blob, worktree after-blob and file mode all match (`ReviewLanding.tsx:77-91`), unreviewed files need a second explicit click (`:119-130`), the rail is a collapsible tree with pointer-captured drag and a keyboard separator (`ReviewFileRail.tsx:160-200`, `:285`, `:563-564`), and comments go to a chosen live session. Orca still holds inline three-way merge (AX delegates to `ConflictDialog`) and an arbitrary compare ref (AX remembers one base per repo, `BranchChangesView.tsx:159`, `:286-290`).
**vs opencode.** Its filterable tree and turn undo/redo are pleasant (`competitor-facts.md:23-25`); AX binds landing to reviewed bytes.

## 2. Weighted overall

| Product | Overview | Workspace | Review | Weighted |
|---|---:|---:|---:|---:|
| AX Code Desktop | 9.35 | 9.22 | 9.30 | **9.30** |
| Orca | 9.00 | 9.00 | 8.90 | **8.97** |
| Claude Code desktop | 8.70 | 9.00 | 8.85 | 8.83 |
| Codex app | 8.20 | 8.30 | 8.85 | 8.45 |
| opencode desktop | 6.80 | 6.90 | 7.50 | 7.07 |

**AX vs Orca: better** (+0.33). **AX vs opencode: better** (+2.23).

## 3. Flip list

Not required; AX leads Orca past the PRD's 0.2 margin. Residual edges to protect: grid panes host a whole session rather than arbitrary tools; Orca's three-way merge and arbitrary compare ref remain unmatched.