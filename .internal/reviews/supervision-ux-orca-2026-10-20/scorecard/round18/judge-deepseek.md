Checkpoint: objective was an independent, read-only round-18 scorecard; evidence came from the four scorecard documents, the PRD pointer, and source reads at HEAD `7811c298`; assumptions are that competitor behavior comes only from `competitor-facts.md` and that the pinned runtime's `inputPreview`/`definitionDigest` emission is asserted by `.internal/reviews/webmcp-excellence-2026-10-21/scores/README.md:231` rather than reproducible here; risk is source-only assessment without journeys; validation was per-claim `path:line` citation. No implementation remains, and shell access is still denied in this read-only session, so no further verification is possible that would change a score.

## 1. Surface scores

| Surface (weight) | AX | Orca | opencode | Codex | Claude |
|---|---|---|---|---|---|
| Mission Control / overview (40%) | **9.35** | 9.00 | 6.80 | 8.20 | 8.70 |
| Workspace / layout (25%) | **9.20** | 9.00 | 6.90 | 8.30 | 8.90 |
| Review changes (35%) | **9.20** | 8.90 | 7.30 | 8.85 | 8.85 |

**Overview — vs Orca:** PR state and check outcome stay counted, removable facets (`components/supervision/missionControl/MissionControlFilters.tsx:133-156`, `:250-265`), and stale previews carry their age and an in-place Retry that never selects the row (`MissionControlRow.tsx:193-219`). Orca's shared glyphs and cross-tab feed are broader ambient signals, but AX answers questions, permissions, batched decisions and waiting browser calls from one inbox (`NeedsYouPopover.tsx:64-65`, `:129`). **vs opencode:** opencode has no multi-agent board and only per-session permission docks, so noticing-and-answering is absent rather than weaker.

**Workspace — vs Orca:** drag to swap or dock on an edge, arrow moves with focus following and a polite announcement, a custom split tree beyond the four presets (`components/sessionGrid/SessionGrid.tsx:118-166`, `:175-214`; `lib/supervision/sessionGrid.ts:304`, `:447`), and pop-out under one reconciled owner (`lib/supervision/sessionGridPopout.ts:11-49`). Orca's panes can host any tool, not only sessions, so I call this parity, not a lead. **vs opencode:** opencode is a timeline plus one right panel with no split panes, while AX runs four complete sessions with their own Chat/Changes/Files/Terminal.

**Review — vs Orca:** landing from This session and Last turn stages only while the mark, index before-blob, worktree after-blob and file mode still match (`components/views/git/ReviewLanding.tsx:77-115`), unreviewed files need a second explicit click (`:116-130`), and the rail is an adjustable collapsible tree (`ReviewFileRail.tsx:160-204`, `:290-327`). Orca still owns inline three-way merge and an arbitrary compare base; AX hands conflicts to a session (`ConflictDialog.tsx:149-178`). **vs opencode:** opencode's comments-as-chips and turn undo are useful, but its review panel has no stage/commit control, so work cannot be landed where it was reviewed.

**WebMCP, folded into workspace and review (round-18 claims verified):** approval cards render the runtime's arguments, including a redacted `inputPreview` whose truncation marker survives filtering (`lib/toolHelpers.ts:454-506`; `PermissionCard.tsx:466-475`), and verify the page's definition by digest with required inputs and the full description behind an expandable summary (`WebMcpApprovalToolInfo.tsx:52-98`); expiry reads as "no answer recorded" (`ToolPart-impl.tsx:1676`; `WebMcpCallStrip.tsx:63-64`; `lib/i18n/messages/en.ts:2731`); registration changes now diff properties, not digests (`lib/webMcpPropertyDiff.ts:2-15`; `WebMcpToolPanel.tsx:1031-1034`); page switcher, per-session revoke and named capacity hold (`WebMcpPages.tsx:14-100`). This raises confidence in what a session did on a page without adding supervision breadth, so I raised review and workspace by 0.05 each.

## 2. Weighted overall

| Product | Overview .40 | Workspace .25 | Review .35 | Weighted |
|---|---|---|---|---|
| AX Code Desktop | 9.35 | 9.20 | 9.20 | **9.26** |
| Orca | 9.00 | 9.00 | 8.90 | **8.97** |
| Claude Code desktop | 8.70 | 8.90 | 8.85 | **8.80** |
| Codex app | 8.20 | 8.30 | 8.85 | **8.45** |
| opencode desktop | 6.80 | 6.90 | 7.30 | **7.00** |

**AX vs Orca: better** (+0.29; overview and content-bound landing carry it, workspace is a tie).
**AX vs opencode: better** (+2.26).

## 3. Flip list

Not required, because AX leads beyond the PRD margin. Residual Orca edges, each smaller than the margin: inline three-way merge, an arbitrary compare ref (AX offers only a remembered selectable Branch base), and panes that host any tool. One WebMCP nit remains: the approval summary truncates the page description at 200 characters, though the full text is one click away and a missing definition fails closed (`WebMcpApprovalToolInfo.tsx:52-57`, `:94`).

Method limits: read-only source verification at HEAD `7811c298`; no journeys run and the uncommitted runtime pin excluded. I could not prove from source that the pinned runtime emits `inputPreview` and `definitionDigest`; the round-18 record asserts it and Desktop handles both older and newer shapes.