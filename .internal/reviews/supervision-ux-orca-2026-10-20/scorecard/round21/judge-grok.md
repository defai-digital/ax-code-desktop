我先讀分數卡、PRD 與第 20 輪判決，再對照原始碼核對第 15–21 輪宣稱的功能。第 21 輪只動到 WebMCP 遮罩。我接著對照原始碼，確認它是否改變監督者看得到的行為。Round 21 judgment at HEAD `15f40f1d`. Competitor scores use `competitor-facts.md` only. Against round 20 grok (AX 9.29, Orca 8.97, +0.32), overview is unchanged. Workspace moves from 9.25 to 9.28 and review from 9.30 to 9.32.

## 1. Surface scores

| Surface | AX | Orca | opencode | Codex | Claude |
|---|---:|---:|---:|---:|---:|
| Mission Control / overview (40%) | **9.30** | 9.00 | 6.80 | 8.20 | 8.70 |
| Workspace / layout (25%) | **9.28** | 9.00 | 6.90 | 8.30 | 9.00 |
| Review changes (35%) | **9.32** | 8.90 | 7.50 | 8.85 | 8.85 |

**Overview — AX vs Orca.** AX shows multi-select PR state and checks facets with counts (`desktop/packages/ui/src/components/supervision/missionControl/MissionControlFilters.tsx:130-159`) and a palette that matches `#123` or `#PR`, with Tab scope and Shift+Enter split-open (`desktop/packages/ui/src/components/ui/CommandPalette.tsx:684-698`, `829-833`). Round 21 does not touch the board, so Orca’s kanban, child rows, feed, and Cmd-J palette stay in the same band.

**Overview — AX vs opencode.** opencode lists projects and recent sessions, and permission prompts stay on the session (`competitor-facts.md:19-22`). AX’s counted facets and a stale-preview Retry that re-reads without selecting the row (`desktop/packages/ui/src/components/supervision/missionControl/MissionControlRow.tsx:81-87`, `201-217`) are what this persona uses across 5–20 sessions.

**Workspace — AX vs Orca.** The grid swaps or docks by drag (`desktop/packages/ui/src/components/sessionGrid/SessionGrid.tsx:133-151`), moves by arrow with focus following (`:175-182`), and stops at four panes (`desktop/packages/ui/src/lib/supervision/sessionGrid.ts:53`, `462-464`); a page has one window owner (`desktop/packages/electron/src/desktop-webmcp-browser.js:802-808`). Round 21 sends argument display through one redactor (`desktop/packages/ui/src/lib/toolHelpers.ts:303-305`), redacts a sibling value when the field name is sensitive (`desktop/shared/webmcp-redaction.mjs:83-85`, `146-156`), and labels a truncated journal input while refusing replay (`desktop/packages/ui/src/components/mcp/WebMcpToolPanel.tsx:1002-1011`). Orca’s recursive mixed-tool pane tree still holds the arrangement edge, so the score moves only from 9.25 to 9.28.

**Workspace — AX vs opencode.** opencode is one timeline plus a resizable right panel (`competitor-facts.md:22`). AX shows up to four sessions, and a shortened page-tool input is diagnosed as truncated (`desktop/packages/ui/src/lib/webMcpDiagnosis.ts:235`; `desktop/packages/ui/src/components/mcp/WebMcpCallDiagnosis.tsx:34-42`).

**Review — AX vs Orca.** A session file counts as reviewed only while the index holds the reviewed before-state and the worktree holds the reviewed after-state and mode (`desktop/packages/ui/src/components/views/git/ReviewLanding.tsx:75-90`). The landing recap keeps definition identity and names a runtime rejection by property (`desktop/packages/ui/src/components/views/git/ReviewLandingBrowserEvidence.tsx:93-100`); a truncated input suppresses missing-property findings and regression export (`desktop/packages/ui/src/lib/webMcpDiagnosis.ts:140-150`, `180`, `235`). Orca’s inline 3-way merge and switchable compare base remain, so review rises only from 9.30 to 9.32.

**Review — AX vs opencode.** opencode’s verified review is a filterable tree with git, branch, and turn modes plus per-turn undo (`competitor-facts.md:23-25`). AX adds content-and-mode landing and a collapsible rail with adjustable width (`desktop/packages/ui/src/components/views/ReviewFileRail.tsx:160-170`, `192-200`, `279-328`). An inferred lack of commit controls is not scored as a weakness.

## 2. Weighted overall

| Product | Overview | Workspace | Review | Weighted |
|---|---:|---:|---:|---:|
| AX Code Desktop | 9.30 | 9.28 | 9.32 | **9.30** |
| Orca | 9.00 | 9.00 | 8.90 | **8.97** |
| Claude Code desktop | 8.70 | 9.00 | 8.85 | **8.83** |
| Codex app | 8.20 | 8.30 | 8.85 | **8.45** |
| opencode desktop | 6.80 | 6.90 | 7.50 | **7.07** |

The raw AX sum is 9.302. The lead over Orca is +0.33, up from +0.32 in round 20. The extra hundredth is honest truncation and field-context redaction on page-tool calls. Receipts stay memory-only and capped at 256 (`desktop/packages/ui/src/stores/useWebMcpApprovalOutcome.ts:30-56`), so a restart still drops the join.

**AX vs Orca: better**

**AX vs opencode: better**
