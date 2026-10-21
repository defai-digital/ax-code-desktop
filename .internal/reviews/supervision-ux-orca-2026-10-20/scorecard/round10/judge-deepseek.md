## Round 10 judgment (independent, read-only)

Verified in source at HEAD `acc31cad`. Competitor facts come only from `competitor-facts.md` (V = verified there, I = inference); unknown competitor capabilities earn no penalty.

### 1. Per surface

| Surface (weight) | AX | Orca | opencode | Codex | Claude |
|---|---:|---:|---:|---:|---:|
| Mission Control / overview (40 %) | **9.2** | 9.0 | 6.5 | 7.8 | 8.6 |
| Workspace / layout (25 %) | **8.9** | 9.0 | 7.0 | 8.2 | 9.0 |
| Review changes (35 %) | **9.1** | 8.9 | 7.4 | 8.8 | 8.8 |

**Overview — vs Orca.** AX now carries the triage signal Orca documents and AX lacked: a `#42 Open · CI checks failed` chip with explicit colour and a named "may be outdated" state (`MissionControlPullRequest.tsx:6-44`), on rows (`MissionControlRow.tsx:268`) and in Peek (`MissionControlPeek.tsx:138`), with a PR facet that excludes merged-but-failing PRs (`missionControl.ts:136-142`; menu and chip `MissionControlFilters.tsx:105-138,235-259`). Strictly it is a projection, not discovery — a branch the PR store never saw yields no chip (`useMissionControlPullRequests.ts:96-108`) — and Orca's multi-select PR/MR facets with counts stay wider, so the lead is narrow.

**Overview — vs opencode.** opencode has per-session prompt docks and no board (`facts.md:19-21`), so twenty sessions cost twenty inspections; AX answers from one counted inbox with in-place decision cards (`NeedsYouPopover.tsx:111-145`), and the badge now counts unique pending decisions including child sessions (`traySnapshot.ts:184-188`) rather than unread activity.

**Workspace — vs Orca.** The browser pane shows "Agent calls (N)" with tool, redacted arguments, outcome and failure reason from the transcript (`WebMcpCallStrip.tsx:13-91`, `webMcpCalls.ts:53-85`, mounted `EmbeddedWebMcpBrowser.tsx:432`) — something a browser pane with no page-tool concept cannot express. That does not close the layout gap: the grid is still four fixed layouts with ratio splitters, no pane trees or drag-to-split (`SessionGrid.tsx:69-90`), so AX still loses this surface.

**Workspace — vs opencode.** opencode documents one centre column plus a right panel and no split (`facts.md:22`); AX runs up to four sessions each with chat, changes, files and terminal, plus page tools with schemas and a "Try it" that grants nothing (`WebMcpToolPanel.tsx:59-112,187-191`).

**Review — vs Orca.** "Tried in the browser this turn" sits beside Stage, Commit and Push, counts the latest turn's page-tool calls and failures, opens the browser, and is labelled as calls, not test results (`ReviewLandingBrowserEvidence.tsx:13-48`, mounted `ReviewLanding.tsx:366-373`; bounded to the turn, `webMcpCalls.ts:38-44`). Orca has no equivalent; AX also keeps checks beside the action (`ReviewLandingChecks.tsx:31`). Orca retains inline 3-way merge, and landing is still absent from This session and Last turn (`DiffView.tsx:2077`).

**Review — vs opencode.** AX has landing, content-bound preflight, F7 hunks and resolving threads; opencode's review stays read-and-comment (`facts.md:23-25`).

### 2. Weighted (40/35/25)

AX **9.09** · Orca **8.97** · Claude 8.77 · Codex 8.25 · opencode 6.94.

**AX vs Orca: equal** — a 0.12 lead sits inside the judges' ~0.1-0.15 spread and short of the PRD's 0.2 (`PRD…:49`).
**AX vs opencode: better.**

Honesty note: the eight failure codes, redacted input preview and "Next step" (`toolHelpers.ts:258-377`; `ToolPart-impl.tsx:221-222`) render only when a runtime ships ADR-266, which is not pinned, so on today's runtime that line stays empty.

### 3. Three smallest changes most likely to flip it

1. Mount `ReviewLanding` in This session and Last turn (`DiffView.tsx:2077` excludes them) using the existing preflight — the agent's own changes are the persona's most frequent review target.
2. Let the board discover PRs for branches the store does not yet know (`useMissionControlPullRequests.ts:108`), and make the PR facet multi-select with counts — Orca's remaining documented overview advantage.
3. Free arrangement in the grid: drag to split, reorder, pop one slot out to its own window, reusing `sessionGridGeometry` — the only surface AX still loses.

**Verification:** every AX claim above is read from current source; the three claims I had checked only against round 9 (grid layouts, "Try it", actionable inbox) are now confirmed at the cited lines. Scores remain source-based judgments; no competitor app was run, and no journey was rerun — that limit applies to all five products equally.