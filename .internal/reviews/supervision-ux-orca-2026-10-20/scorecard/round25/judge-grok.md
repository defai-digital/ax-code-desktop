我先讀分數卡、PRD 與 round 24 判決，再對 HEAD 原始碼逐項核對，獨立打第 25 輪分數。Round 24 判在 `5193b0c8`；HEAD 是 `0fb2203e`。我接著核對之後的差異，並到原始碼確認評分依據。Round 24 之後主要是 WebMCP 遮罩與測試。我對照原始碼核對看板、工作區與審查面上的行為是否真的還在。Independent scorecard at HEAD `0fb2203e`. Competitor scores use `competitor-facts.md` only. Round 24 grok at `5193b0c8` was AX 9.30 (workspace 9.29, review 9.32) against Orca 8.97. Commits since then keep inherited field sensitivity and mask compound diagnostic pairs (`desktop/shared/webmcp-redaction.mjs:150-161`). That closes a display leak on cards and recaps. It adds no supervision control, so no surface rises. Workspace is scored 9.25 because four panes is still the ceiling for this persona.

## 1. Surface scores

| Surface | AX | Orca | opencode | Codex | Claude |
|---|---:|---:|---:|---:|---:|
| Mission Control / overview (40%) | **9.30** | 9.00 | 6.80 | 8.20 | 8.70 |
| Workspace / layout (25%) | **9.25** | 9.00 | 6.90 | 8.30 | 9.00 |
| Review changes (35%) | **9.30** | 8.90 | 7.50 | 8.85 | 8.85 |

**Overview — AX vs Orca.** AX answers from counted multi-select PR-state and checks facets (`desktop/packages/ui/src/components/supervision/missionControl/MissionControlFilters.tsx:130-159`), and a row shows that session’s page access, including waiting (`desktop/packages/ui/src/hooks/useWebMcpPages.ts:11-12`, `desktop/packages/ui/src/components/mcp/WebMcpPages.tsx:192`, `desktop/packages/ui/src/components/supervision/missionControl/MissionControlRow.tsx:253`). Orca’s kanban, child rows, cross-worktree feed, and mark-unread stay in the same band; AX’s stale preview names its age and retries without selecting the row (`MissionControlRow.tsx:81-87`, `205-218`).

**Overview — AX vs opencode.** opencode lists projects and recent sessions, with permission prompts docked on the session (`competitor-facts.md:19-22`). AX puts child agents on the board (`MissionControlRow.tsx:355-360`), counts hidden waiting pages in Needs you (`desktop/packages/ui/src/components/supervision/NeedsYouButton.tsx:27-30`), and keeps last-read age plus Retry on the preview (`MissionControlRow.tsx:81-87`, `205-218`).

**Workspace — AX vs Orca.** The grid swaps or docks by drag (`desktop/packages/ui/src/components/sessionGrid/SessionGrid.tsx:142-151`), moves by arrow with focus following the moved session (`SessionGrid.tsx:86-89`, `175-182`), stops at four panes (`desktop/packages/ui/src/lib/supervision/sessionGrid.ts:53`, `462-464`), and leaves a popped-out session mounted only in its own window (`SessionGrid.tsx:397-400`). A lost host renderer pauses that page and keeps the guest (`desktop/packages/electron/src/desktop-webmcp-browser.js:1090-1092`). Orca’s recursive mixed-tool pane tree is why this stays at 9.25.

**Workspace — AX vs opencode.** opencode is one timeline plus a resizable right panel, with no split panes (`competitor-facts.md:22`). AX keeps up to four sessions on screen, and each grid header shows that session’s page and access, including waiting (`SessionGrid.tsx:288`, `WebMcpPages.tsx:176-194`).

**Review — AX vs Orca.** A session file counts as reviewed only while the index holds the reviewed before-state and the worktree holds the reviewed after-state and mode (`desktop/packages/ui/src/components/views/git/ReviewLanding.tsx:77-90`), and the landing recap jumps to the step with duration and definition identity (`desktop/packages/ui/src/components/views/git/ReviewLandingBrowserEvidence.tsx:141-173`). Orca’s inline three-way merge and switchable compare base remain. Approval receipts stay memory-only and capped at 256 (`desktop/packages/ui/src/stores/useWebMcpApprovalOutcome.ts:31-56`).

**Review — AX vs opencode.** opencode’s verified review is a filterable tree with git, branch, and turn modes plus per-turn undo (`competitor-facts.md:23-25`). AX adds content-and-mode landing and a collapsible rail with an adjustable separator (`desktop/packages/ui/src/components/views/ReviewFileRail.tsx:192-199`, `553-556`, `562-572`). The fact file’s note on missing commit controls is inference, so it stays unscored.

## 2. Weighted overall

| Product | Overview | Workspace | Review | Weighted |
|---|---:|---:|---:|---:|
| AX Code Desktop | 9.30 | 9.25 | 9.30 | **9.29** |
| Orca | 9.00 | 9.00 | 8.90 | **8.97** |
| Claude Code desktop | 8.70 | 9.00 | 8.85 | **8.83** |
| Codex app | 8.20 | 8.30 | 8.85 | **8.45** |
| opencode desktop | 6.80 | 6.90 | 7.50 | **7.07** |

The raw AX sum is 9.2875. Against round 24 grok, the lead over Orca moves from +0.33 to +0.32. The change is the four-pane ceiling, weighed more heavily here. Round 25 redaction does not earn a tenth.

**AX vs Orca: better**

**AX vs opencode: better**
