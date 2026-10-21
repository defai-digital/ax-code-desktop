## 1. Surface scores (0–10, strict; unknown competitor capability never counted against them)

| Surface (weight) | AX | Orca | opencode | Codex | Claude |
|---|---|---|---|---|---|
| Mission Control / overview (40%) | 9.1 | 9.0 | 6.8 | 8.2 | 8.7 |
| Workspace / layout (25%) | 8.8 | 9.05 | 6.9 | 8.3 | 8.9 |
| Review changes (35%) | 9.1 | 8.9 | 7.3 | 8.85 | 8.85 |

**Overview — AX vs Orca:** AX keeps the only in-place decision inbox, plus preview age and Retry on the row itself (`MissionControlRow.tsx:82-87`, `:205-219`), and round 14 turns a browser-blocked agent into an overview item: a page waiting for a person shows in Needs You (`NeedsYouPopover.tsx:121`) and on the row (`MissionControlRow.tsx:253`). Orca still leads on palette depth (`#PR`, host filter, split-open) and PR multi-select, so AX's board lead stays small. **AX vs opencode:** opencode has no multi-agent board and only per-session permission docks, so AX wins every notice-and-answer step by a wide margin.

**Workspace — AX vs Orca:** AX's session grid offers only 1/2/3/2x2 presets with Focus/Replace/Close (`SessionGrid.tsx:78-90`), no drag-to-split and no pane pop-out — exactly Orca's strength. Round 14's page switcher, per-session revoke and named capacity (`WebMcpPages.tsx:11-56`, `:117-127`) is a genuine gain Orca cannot follow (no page-tool concept), but it does not change pane arrangement, so Orca still leads. **AX vs opencode:** opencode is one timeline plus a right panel with no split panes, while AX runs two to four sessions each with its own Chat/Changes/Files/Terminal (`SessionGrid.tsx:121`); AX is clearly ahead.

**Review — AX vs Orca:** Stage/Commit/Push exists in all four scopes bound to the reviewed content (`ReviewLanding.tsx:43`, used at `DiffView.tsx:2084`, `SessionChangesView.tsx:420`), with a collapsible, width-adjustable rail (`ReviewFileRail.tsx:99-126`, `:169-171`) and F7 hunk navigation (`useReviewHunkKeys.ts:50`). Orca's inline three-way merge and switchable base remain an edge, but AX leads on landing safety and viewed marks. **AX vs opencode:** opencode has no stage/commit controls, so a change cannot be landed where it is reviewed; AX wins.

## 2. Weighted overall

| Product | Overview .40 | Workspace .25 | Review .35 | Weighted |
|---|---|---|---|---|
| AX Code Desktop | 9.1 | 8.8 | 9.1 | **9.03** |
| Orca | 9.0 | 9.05 | 8.9 | **8.98** |
| Claude Code desktop | 8.7 | 8.9 | 8.85 | **8.80** |
| Codex app | 8.2 | 8.3 | 8.85 | **8.45** |
| opencode desktop | 6.8 | 6.9 | 7.3 | **7.00** |

AX vs Orca: **equal** (AX +0.05, inside the ±0.1 judge spread; the PRD's 0.2 lead is not met).
AX vs opencode: **better** (+2.03).

Not scored but observed: the builder CLI is correctly usage-gated (`webmcp-check.mjs:16-18`), yet bare `pnpm run webmcp:check` surfaces only `ELIFECYCLE ... 64`; the real `--url is required` line goes to stderr, so a first-time builder sees a bare failure (Journal panel itself verified: `WebMcpToolPanel.tsx:270-350`, `:960-999`).

## 3. Three smallest changes most likely to flip AX vs Orca

1. **Grid pane arrangement** — drag a pane header to reorder/split and pop a pane into its own window, replacing the fixed presets at `SessionGrid.tsx:78-90`. Workspace is the only surface Orca leads; parity is worth ≈+0.06 weighted, more than the current gap.
2. **PR/CI multi-select facet with counts that follow the other active filters** (Orca V). AX has only a single "Checks failing" toggle (`MissionControlFilters.tsx:156-171`); the data already exists from round 10.
3. **Palette parity** — `#PR` search, Tab host/project filter, Shift+Enter split-open. Pure UI on the existing palette; removes Orca's last overview workflow advantage at near-zero risk.