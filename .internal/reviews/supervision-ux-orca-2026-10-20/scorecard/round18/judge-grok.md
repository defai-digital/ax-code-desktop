我先讀分數卡證據與第 17 輪判決，再對照原始碼核對第 15–18 輪的宣稱，獨立打分。第 18 輪的核准卡與 schema diff 是這次評分的增量。我對照原始碼核對它們是否真的落在監督者會用到的表面上。Round 18 judgment at HEAD `7811c298`. Competitor scores use `competitor-facts.md` only. Unknown capabilities are not weaknesses. Round 17 at `7f63b436` was AX 9.23 versus Orca 8.97. This round moves only the workspace, by 0.05.

## 1. Surface scores

| Surface | AX | Orca | opencode | Codex | Claude |
|---|---:|---:|---:|---:|---:|
| Mission Control / overview (40%) | **9.3** | 9.0 | 6.8 | 8.2 | 8.7 |
| Workspace / layout (25%) | **9.2** | 9.0 | 6.9 | 8.3 | 9.0 |
| Review changes (35%) | **9.2** | 8.9 | 7.5 | 8.85 | 8.85 |

**Overview — AX vs Orca.** AX keeps multi-select PR state and checks facets with counts (`MissionControlFilters.tsx:130-159`), a palette that matches `#123` or `#PR` (`CommandPalette.tsx:684-698`), Tab scope (`:829-831`), and Shift+Enter split-open (`:833-840`), plus a stale preview age and a Retry that does not open the row (`MissionControlRow.tsx:81-87`, `:205-216`). Orca's kanban, child rows, feed, and Cmd-J palette cover the same job, and round 18 adds no overview capability, so both stay at the top of the band.

**Overview — AX vs opencode.** opencode lists projects and recent sessions, and permission prompts stay on the session (`competitor-facts.md:19-22`). AX's board, counted facets, and Retry are what this persona uses to notice and answer work across 5–20 sessions.

**Workspace — AX vs Orca.** The grid swaps or docks by drag (`SessionGrid.tsx:142-151`; `sessionGrid.ts:447-459`), moves by arrow with focus following (`SessionGrid.tsx:86-89`, `:175-182`, `:248-255`), stops at four panes (`sessionGrid.ts:53`, `:462-464`), refuses a second browser owner (`sessionGridPopout.ts:57-60`; `desktop-webmcp-browser.js:848-858`), and remembers preset ratios (`sessionGridPreferences.ts:40-49`). Round 18 shows redacted runtime arguments (`PermissionCard.tsx:471-474`; `toolHelpers.ts:474-484`), the page definition only when the digest matches, with the full description behind the 200-character summary (`WebMcpApprovalToolInfo.tsx:44-56`, `:91-97`), an unanswered receipt when an accepted snapshot drops the request (`useWebMcpApprovalOutcome.ts:16-24`; `bootstrap.ts:312-314`; `WebMcpCallStrip.tsx:63-64`; `ToolPart-impl.tsx:1676`), and a property diff of type, required, enum, and description (`webMcpPropertyDiff.ts:2-15`; `WebMcpToolPanel.tsx:306-308`, `:1033-1034`). Orca's recursive pane tree is still the more general arrangement, and the diff is advisory JSON, so the score rises only from 9.15 to 9.2.

**Workspace — AX vs opencode.** opencode is one timeline plus a resizable right panel and has no split panes (`competitor-facts.md:22`). AX shows up to four sessions, each able to keep its own page, call strip, and approval outcome.

**Review — AX vs Orca.** A session file counts as reviewed only while the index holds the reviewed before-state and the worktree holds the reviewed after-state and mode (`ReviewLanding.tsx:75-90`); the rail is a collapsible tree with a drag width (`ReviewFileRail.tsx:160-200`, `:290-293`), and the recap jumps to the call with duration and definition identity (`ReviewLandingBrowserEvidence.tsx:152-186`). Round 18 does not change landing, and Orca's inline 3-way merge and switchable compare base (`competitor-facts.md:13-16`) still cover conflict resolution, so the score stays 9.2.

**Review — AX vs opencode.** opencode's verified review is a filterable tree with git, branch, and turn modes plus per-turn undo. AX adds content-and-mode landing and a browser recap beside that action; an inferred lack of commit controls is not scored as a weakness.

## 2. Weighted overall

| Product | Overview | Workspace | Review | Weighted |
|---|---:|---:|---:|---:|
| AX Code Desktop | 9.30 | 9.20 | 9.20 | **9.24** |
| Orca | 9.00 | 9.00 | 8.90 | **8.97** |
| Claude Code desktop | 8.70 | 9.00 | 8.85 | **8.83** |
| Codex app | 8.20 | 8.30 | 8.85 | **8.45** |
| opencode desktop | 6.80 | 6.90 | 7.50 | **7.07** |

The lead over Orca is +0.27, up from +0.26 in round 17. The extra 0.05 is the workspace receipt and schema diff. Overview and review are unchanged.

**AX vs Orca: better**

**AX vs opencode: better**
