## 1. Surface scores (0–10; only source-verified AX claims count)

| Surface (weight) | AX | Orca | opencode | Codex | Claude |
|---|---|---|---|---|---|
| Mission Control / overview (40%) | **9.3** | 9.0 | 6.8 | 8.2 | 8.7 |
| Workspace / layout (25%) | **9.1** | 9.05 | 6.9 | 8.3 | 8.9 |
| Review changes (35%) | **9.1** | 8.9 | 7.3 | 8.85 | 8.85 |

**Overview — AX vs Orca:** Round 14's named gap is closed: PR state and checks are now multi-select facets whose counts are recomputed with every other facet retained (`MissionControlFilters.tsx:130-163`, `missionControl.ts:164-180`), and the palette resolves `#123`/`#PR <state>` and scopes by host/project (`CommandPalette.tsx:684-699`, `:677-683`). Orca's card feed is still slightly richer, but AX keeps the only in-place decision inbox with row previews, Retry and last-read age. **AX vs opencode:** opencode has no multi-agent board and only per-session permission docks, so notice-and-answer is absent rather than weaker.

**Workspace — AX vs Orca:** The grid now drags to swap (centre) or dock on an edge with drop zones, moves with arrow keys while focus follows the moved pane, splits to four panes, pops a pane into its own window and returns it through one native owner, and remembers per-layout ratios (`SessionGrid.tsx:142-182`, `:248-259`, `:355-368`; `sessionGrid.ts:53`, `:424-435`; `sessionGridPreferences.ts:28-53`). Orca's recursive pane tree is more general, so I call this parity, not a lead — though AX's per-session page switcher and revoke have no Orca equivalent (`WebMcpPages.tsx:12-58`). **AX vs opencode:** opencode is a timeline plus one right panel with no split panes; AX runs up to four full sessions each with Chat/Changes/Files/Terminal.

**Review — AX vs Orca:** Stage/Commit/Push in This session and Last turn is bound to the reviewed content *and* file mode (`ReviewLanding.tsx:77-115`, `:252-284`, used at `DiffView.tsx:2084` and `SessionChangesView.tsx:420`), and the rail is a collapsible tree with pointer and keyboard width (`ReviewFileRail.tsx:160-171`, `:562-573`). Orca still owns inline three-way merge and an arbitrary compare base. **AX vs opencode:** opencode's review panel has no stage/commit control, so a change cannot be landed where it is reviewed.

## 2. Weighted overall

| Product | Overview .40 | Workspace .25 | Review .35 | Weighted |
|---|---|---|---|---|
| AX Code Desktop | 9.3 | 9.1 | 9.1 | **9.18** |
| Orca | 9.0 | 9.05 | 8.9 | **8.98** |
| Claude Code desktop | 8.7 | 8.9 | 8.85 | **8.80** |
| Codex app | 8.2 | 8.3 | 8.85 | **8.45** |
| opencode desktop | 6.8 | 6.9 | 7.3 | **7.00** |

**AX vs Orca: better** (+0.20, at the PRD margin; workspace is still a tie, and the lead rests on overview facets/palette plus landing safety).
**AX vs opencode: better** (+2.18).

## 3. Flip list

Not required — AX is ahead. Residual Orca edges a future round could close cheaply: inline three-way merge (`ConflictDialog.tsx:248` still hands conflicts to a session), an arbitrary compare base for the git diff, and a recursive pane tree so a pane can hold any tool rather than a whole session. None is worth more than the current margin for this persona. Also observed, not scored: `pnpm run webmcp:check` exists (`package.json:40`) and the tool panel shows schema, hints and lint (`WebMcpToolPanel.tsx:417-431`, `:438-460`), but a bare invocation still surfaces the wrapper's exit line before the missing-`--url` message.