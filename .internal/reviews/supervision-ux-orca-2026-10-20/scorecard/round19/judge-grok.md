我先核對分數卡、PRD 與原始碼，再獨立打第 19 輪的分數。第 18 輪已領先 Orca。我接著核對 `806602a7..HEAD` 裡第 19 輪的實際改動，再決定分數要不要動。第 19 輪是 WebMCP 身分與紅線修正。我對照核准卡、回顧摘要與工具面板的原始碼，確認監督者看得到的行為。Round 19 judgment at HEAD `f06cea02`. Competitor scores use `competitor-facts.md` only. Against round 18 grok (AX 9.24, Orca 8.97, +0.27), only review moves, by 0.05.

## 1. Surface scores

| Surface | AX | Orca | opencode | Codex | Claude |
|---|---:|---:|---:|---:|---:|
| Mission Control / overview (40%) | **9.3** | 9.0 | 6.8 | 8.2 | 8.7 |
| Workspace / layout (25%) | **9.2** | 9.0 | 6.9 | 8.3 | 9.0 |
| Review changes (35%) | **9.25** | 8.9 | 7.5 | 8.85 | 8.85 |

**Overview — AX vs Orca.** AX shows multi-select PR state and checks facets with counts (`MissionControlFilters.tsx:130-159`), a palette that matches `#123` or `#PR` (`CommandPalette.tsx:684-698`), Tab scope (`:829-831`), and Shift+Enter split-open (`:833-840`), plus a stale preview age and a Retry that re-reads without selecting the row (`MissionControlRow.tsx:81-87`, `:210-213`; `useRemoteActivityPreviews.ts:15-17`). Orca’s kanban, child rows, feed, and Cmd-J palette cover the same job, and round 19 leaves the overview as it was, so both stay at the top of the band.

**Overview — AX vs opencode.** opencode lists projects and recent sessions, and permission prompts stay on the session (`competitor-facts.md:19-22`). AX’s board, counted facets, and Retry are what this persona uses to notice and answer work across 5–20 sessions.

**Workspace — AX vs Orca.** The grid swaps or docks by drag (`SessionGrid.tsx:142-151`; `sessionGrid.ts:447-459`), moves by arrow with focus following (`SessionGrid.tsx:85-89`, `:175-182`), stops at four panes (`sessionGrid.ts:53`, `:462-464`), keeps one browser owner (`desktop-webmcp-browser.js:799-808`), and remembers preset ratios (`sessionGridPreferences.ts:40-49`). Round 19 issues a stable invocation id and a distinct label for a redacted name (`webmcp-catalog-projection.cjs:51-77`) and extends the advisory property diff to numeric, length, pattern, format, and default constraints after redacting the schema (`webMcpPropertyDiff.ts:10-18`; `WebMcpToolPanel.tsx:1053`). That hardens a surface already scored. Orca’s recursive pane tree remains the more general arrangement, so the score stays 9.2.

**Workspace — AX vs opencode.** opencode is one timeline plus a resizable right panel (`competitor-facts.md:22`). AX shows up to four sessions, each able to keep its own page, with redacted runtime arguments on the approval card (`PermissionCard.tsx:473-481`) and the page definition only when the digest matches (`WebMcpApprovalToolInfo.tsx:35-40`).

**Review — AX vs Orca.** A session file counts as reviewed only while the index holds the reviewed before-state and the worktree holds the reviewed after-state and mode (`ReviewLanding.tsx:75-90`). The rail is a collapsible tree with a drag width (`ReviewFileRail.tsx:169-177`, `:274-309`). Round 19 withholds “tools not called” when any invoke lacks an invocation id and says the association is unknown (`ReviewLandingBrowserEvidence.tsx:95-100`, `:216-224`; `en.ts:54`). Orca’s inline 3-way merge and switchable compare base (`competitor-facts.md:13-16`) still cover conflict resolution, so the score rises from 9.2 to 9.25.

**Review — AX vs opencode.** opencode’s verified review is a filterable tree with git, branch, and turn modes plus per-turn undo. AX adds content-and-mode landing and a recap that jumps to the call with duration and definition identity (`ReviewLandingBrowserEvidence.tsx:162-197`). An inferred lack of commit controls is not scored as a weakness.

## 2. Weighted overall

| Product | Overview | Workspace | Review | Weighted |
|---|---:|---:|---:|---:|
| AX Code Desktop | 9.30 | 9.20 | 9.25 | **9.26** |
| Orca | 9.00 | 9.00 | 8.90 | **8.97** |
| Claude Code desktop | 8.70 | 9.00 | 8.85 | **8.83** |
| Codex app | 8.20 | 8.30 | 8.85 | **8.45** |
| opencode desktop | 6.80 | 6.90 | 7.50 | **7.07** |

The lead over Orca is +0.29, up from +0.27 in round 18. The extra 0.02 is the recap refusing a false unused-tool list. Joins require both the main-issued id and the native digest (`webMcpCatalog.ts:102-104`, `:279-286`). Overview and workspace are unchanged.

**AX vs Orca: better**

**AX vs opencode: better**
