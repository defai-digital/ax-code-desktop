I'll judge round 20 independently from the scorecard evidence and the current source, starting with the controlling documents and the round-19 baseline.Round 20 judgment at HEAD `4b7f80db`. Competitor scores use `competitor-facts.md` only. Against round 19 grok (AX 9.26, Orca 8.97, +0.29), workspace and review each move by 0.05. Overview is unchanged.

## 1. Surface scores

| Surface | AX | Orca | opencode | Codex | Claude |
|---|---:|---:|---:|---:|---:|
| Mission Control / overview (40%) | **9.3** | 9.0 | 6.8 | 8.2 | 8.7 |
| Workspace / layout (25%) | **9.25** | 9.0 | 6.9 | 8.3 | 9.0 |
| Review changes (35%) | **9.30** | 8.9 | 7.5 | 8.85 | 8.85 |

**Overview — AX vs Orca.** AX shows multi-select PR state and checks facets with counts (`MissionControlFilters.tsx:130-159`) and a palette that matches `#123` or `#PR` (`CommandPalette.tsx:684-698`), with Tab scope and Shift+Enter split-open (`CommandPalette.tsx:829-833`). Round 20 does not touch the board, so Orca’s kanban, child rows, feed, and Cmd-J palette stay in the same band.

**Overview — AX vs opencode.** opencode lists projects and recent sessions, and permission prompts stay on the session (`competitor-facts.md:19-22`). AX’s counted facets and a stale-preview Retry that re-reads without selecting the row (`MissionControlRow.tsx:201-217`) are what this persona uses across 5–20 sessions.

**Workspace — AX vs Orca.** The grid swaps or docks by drag (`SessionGrid.tsx:142-151`), moves by arrow with focus following (`SessionGrid.tsx:175-182`), and stops at four panes (`sessionGrid.ts:53`, `sessionGrid.ts:462-464`). Round 20 keeps a redacted approval receipt after the card is gone and joins its preview and digest to the call strip (`useWebMcpApprovalOutcome.ts:31-53`; `event-reducer.ts:822-824`; `useWebMcpTranscriptCalls.ts:15-25`; `WebMcpCallStrip.tsx:107-114`). The cache is memory-only and capped at 256, so a restart drops the join, and Orca’s recursive pane tree still holds the arrangement edge. The score moves from 9.2 to 9.25.

**Workspace — AX vs opencode.** opencode is one timeline plus a resizable right panel (`competitor-facts.md:22`). AX shows up to four sessions, and an expanded page-tool row diagnoses the digest-named definition or says that definition is gone (`ToolPart-impl.tsx:2046-2068`; `webMcpDiagnosis.ts:227-236`).

**Review — AX vs Orca.** A session file counts as reviewed only while the index holds the reviewed before-state and the worktree holds the reviewed after-state and mode (`ReviewLanding.tsx:75-90`). The landing recap now keeps the approval’s digest and preview, checks that exact definition, and names a runtime rejection by property (`ReviewLandingBrowserEvidence.tsx:34-56`, `ReviewLandingBrowserEvidence.tsx:98-100`, `ReviewLandingBrowserEvidence.tsx:183`; `webMcpCatalog.ts:282-288`; `en.ts:3776-3777`). Orca’s inline 3-way merge and switchable compare base remain, so review rises only from 9.25 to 9.30.

**Review — AX vs opencode.** opencode’s verified review is a filterable tree with git, branch, and turn modes plus per-turn undo. AX adds content-and-mode landing and a recap that refuses to score a call against the page’s current schema when the invoked definition is unavailable (`WebMcpCallDiagnosis.tsx:34-42`, `WebMcpCallDiagnosis.tsx:87-91`). An inferred lack of commit controls is not scored as a weakness.

## 2. Weighted overall

| Product | Overview | Workspace | Review | Weighted |
|---|---:|---:|---:|---:|
| AX Code Desktop | 9.30 | 9.25 | 9.30 | **9.29** |
| Orca | 9.00 | 9.00 | 8.90 | **8.97** |
| Claude Code desktop | 8.70 | 9.00 | 8.85 | **8.83** |
| Codex app | 8.20 | 8.30 | 8.85 | **8.45** |
| opencode desktop | 6.80 | 6.90 | 7.50 | **7.07** |

The lead over Orca is +0.32, up from +0.29 in round 19. The extra 0.03 is the completed call keeping its approved input and exact definition, including a property-level runtime rejection, instead of falling back to the page’s current schema. Receipts are not durable across restart.

**AX vs Orca: better**

**AX vs opencode: better**
