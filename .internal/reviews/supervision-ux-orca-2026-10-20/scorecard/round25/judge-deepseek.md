Final verification closed the one gap my checkpoint flagged: `ConflictDialog.tsx` exists and was only missed by a bad path. It is now read — it fetches conflict details (`:77-92`, unmerged files at `:186`) and offers "Resolve in current session" / "Resolve in new session" (`:256`, `:269`), i.e. AX *delegates* conflict resolution to an agent rather than presenting an inline three-way merge editor. So Orca's merge edge is confirmed on both sides rather than assumed.

## Method

Read-only source verification at HEAD `0fb2203e`. No shell was available, so no tests or journeys were rerun; every AX claim is a file:line I read. Uncommitted `config/`, lockfile and version pins ignored. Rounds 22–24 (redaction unification, browser lifecycle) I treat as trust/consistency hardening, not supervision breadth, so they add no uplift over round 21.

## 1. Surface scores

| Surface (weight) | AX | Orca | opencode | Codex app | Claude Code |
|---|---:|---:|---:|---:|---:|
| Mission Control / overview (.40) | **9.20** | 9.00 | 6.80 | 8.20 | 8.70 |
| Workspace / layout (.25) | **9.00** | 9.05 | 6.90 | 8.30 | 8.90 |
| Review changes (.35) | **9.20** | 8.95 | 7.40 | 8.85 | 8.85 |

**Overview — vs Orca.** Counted, multi-select PR-state *and* checks facets with removable chips (`components/supervision/missionControl/MissionControlFilters.tsx:130-165`, `:250-268`) plus a stale preview stating its own age with a Retry that never selects the row (`MissionControlRow.tsx:81-87`, `:205-219`) make "what needs me" answerable without opening sessions. Orca still reads faster at a glance, and AX's row carries origin/enabled (`MissionControlRow.tsx:254-277`) but no *waiting-page* marker — that signal lives only in Needs You (`NeedsYouPopover.tsx:64-65`, `NeedsYouButton.tsx:27-31`).
**vs opencode.** No multi-agent board and only per-session permission docks (`competitor-facts.md:19`, `:21`) leave triage structurally absent; AX adds the Activity feed and counted facets.

**Workspace — vs Orca.** A real free-arrangement tree with drag-swap/edge-dock, arrow moves with following focus, four-edge split, pop-out and remembered ratios (`components/sessionGrid/SessionGrid.tsx:168-170`, `:245-258`, `:303-321`, `:357-366`, `:433-451`; `lib/supervision/sessionGrid.ts:303-306`) closes the old gap, and per-session pages with revoke and capacity are unique (`components/mcp/WebMcpPages.tsx:14-130`). Orca still wins narrowly: recursive pane trees hosting any tool type, versus AX's four slots (`sessionGrid.ts:463-464`) and panes that embed only the session app (`SessionGrid.tsx:396-413`).
**vs opencode.** One resizable right panel with no split panes (`competitor-facts.md:22`) cannot compare two agents; AX shows four.

**Review — vs Orca.** Landing from This session and Last turn requires mark, index `before` blob, worktree `after` blob and file mode to still agree, with a fresh re-read abort and index-identity commit preflight (`views/git/ReviewLanding.tsx:77-91`, `:191-245`, `:252-284`); the rail is a collapsible tree with drag and keyboard width (`ReviewFileRail.tsx:160-200`, `:270-328`); the recap gives jump-to-step, durations and definition identity beside the action (`ReviewLandingBrowserEvidence.tsx:79-104`, `:134-170`). Orca keeps inline three-way merge — AX delegates instead (`views/git/ConflictDialog.tsx:77-92`, `:256`, `:269`) — and a freely switchable compare base.
**vs opencode.** Its filterable tree and mode switch are pleasant but have no landing controls; AX binds staging to reviewed bytes.

## 2. Weighted overall

| Product | Weighted |
|---|---:|
| **AX Code Desktop** | **9.15** |
| Orca | 9.00 |
| Claude Code | 8.80 |
| Codex app | 8.45 |
| opencode | 7.04 |

**AX vs Orca: better** (+0.15 — under the PRD's 0.2 margin at my weighting, where I concede Orca the workspace surface).
**AX vs opencode: better** (+2.12).

## 3. Three smallest flips

1. **Per-row waiting-page chip** in `MissionControlRow` beside the origin chip, reusing the Needs You filter (`NeedsYouButton.tsx:27-31`) — ~15 lines; a browser-blocked call becomes visible on the board.
2. **A page surface inside grid panes** — panes embed only the session app (`SessionGrid.tsx:396-413`); mount the existing switcher per pane.
3. **Inline three-way merge** in the conflict surface, which already has the merge inputs (`ConflictDialog.tsx:77-92`) but no editor — Orca's one clear remaining review edge.