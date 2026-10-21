# Round 15 independent judgment (HEAD `92775899`)

Verified in source: drag-to-edge dock + arrow moves with focus following the moved pane at `desktop/packages/ui/src/lib/supervision/sessionGrid.ts:405-435` (free arrangement `tree`, preset fallback via `sameShape`), `desktop/packages/ui/src/components/sessionGrid/SessionGrid.tsx:175-183` (announcement + focus destination) and `283-301` (arrow buttons); pop-out/restore via `popOutGridSlot/returnGridSlot` and `data-session-grid-popout/-return`; ratios persisted at `lib/supervision/sessionGridPreferences`. Mission Control PR facet at `missionControl/MissionControlFilters.tsx:118-165` (states+checks multi-check, `prCounts` rendered `:159`); palette at `ui/CommandPalette.tsx:677-708` (`#PR`/`#123` matching with `pr.number`/`pr.state`), Tab scopes by host or project at `:829-832`/`:858-885`, Shift+Enter opens beside at `:833-841` calling `handleSplitSession` at `:766-786`.

## 1. Surface scores (1–10)

| Surface (weight) | AX | Orca | opencode | Codex | Claude |
|---|---:|---:|---:|---:|---:|
| Mission Control / overview (40%) | **9.25** | 8.95 | 6.85 | 8.3 | 8.7 |
| Workspace / layout (25%) | **9.15** | 9.0 | 6.95 | 8.35 | 9.0 |
| Review changes (35%) | **9.20** | 8.85 | 7.5 | 8.85 | 8.85 |

**Overview — AX vs Orca.** AX now ships a two-group (states + checks) PR facet with counts that follow the other filters (`MissionControlFilters.tsx:130-165`) and a palette that matches `#PR` and `#123` against the runtime's `pullRequest` (`CommandPalette.tsx:684-700`); these close the remaining overview gaps to Orca's documented Cmd-J + multi-select PR facet. **AX vs opencode.** AX keeps opencode contained: opencode has no multi-agent board, only per-session permission docks.

**Workspace — AX vs Orca.** The session grid now supports drag-to-edge dock and arrow moves with focus following the moved session (`SessionGrid.tsx:175-183`, `lib/supervision/sessionGrid.ts:405-435`), split up to four panes, pop-out / restore with `gridWindowOwns` ownership, and remembered split ratios. Orca documents pane pop-out and free arrangement too; AX closes that surface. **AX vs opencode.** AX wins: opencode is one timeline + right panel with no split panes (`competitor-facts.md:22`).

**Review — AX vs Orca.** Round 15 leaves review untouched: AX still wins on landing safety (`ReviewLanding.tsx:77-91`) and a rail tree (`ReviewFileRail.tsx`), Orca still has switchable compare base and inline 3-way merge. **AX vs opencode.** AX's stage/commit/push, hunk controls and rail tree beat opencode's documented "no commit controls" review surface.

## 2. Weighted overall (overview 40 / review 35 / workspace 25)

| Product | Overview | Workspace | Review | **Weighted** |
|---|---|---|---|---:|
| **AX Code Desktop** | 9.25 | 9.15 | 9.20 | **9.21** |
| Orca | 8.95 | 9.0 | 8.85 | 8.93 |
| Claude Code desktop | 8.7 | 9.0 | 8.85 | 8.83 |
| Codex app | 8.3 | 8.35 | 8.85 | 8.49 |
| opencode desktop | 6.85 | 6.95 | 7.5 | 7.06 |

**AX vs Orca: better** (+0.28, exceeds the 0.2 margin).
**AX vs opencode: better** (+2.15).

## 3. Three smallest changes if not better than Orca (not needed)

If the gap regressed, flip with: (a) inline 3-way merge in `ConflictDialog.tsx:176-180` so conflict resolution stops delegating to a session, (b) switchable compare base in `DiffView.tsx:71` to allow any branch tip, (c) reopen/re-anchor comments when stored threads drift past the file content (resolve model is round-3-shipped but lacks a re-fix flow on text drift).