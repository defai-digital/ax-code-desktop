我先讀評分依據與近期變更紀錄，再對照原始碼核對 AX 的主張，獨立打這輪分數。第 24 輪分數已對過。接下來核對第 26 輪在 Mission Control、網格窗格與審查面上的實際程式。Round 26 scorecard at HEAD `96f74a34`. Competitor scores use `competitor-facts.md` only. Against the round-24 cluster (AX weighted 9.25–9.30), the new waiting-page chip and collapsed failure text move overview and review up slightly. Workspace stays with the stricter 9.15 cluster, plus a small step for page access on a grid pane.

## 1. Surface scores

| Surface | AX | Orca | opencode | Codex | Claude |
|---|---:|---:|---:|---:|---:|
| Mission Control / overview (40%) | **9.32** | 9.00 | 6.80 | 8.20 | 8.70 |
| Workspace / layout (25%) | **9.20** | 9.00 | 6.90 | 8.30 | 9.00 |
| Review changes (35%) | **9.28** | 8.90 | 7.50 | 8.85 | 8.85 |

**Overview — AX vs Orca.** A Mission Control row shows a waiting-page chip when that session’s page is waiting and not visible (`desktop/packages/ui/src/lib/webMcpViewKey.ts:24`, `desktop/packages/ui/src/components/supervision/missionControl/MissionControlRow.tsx:106-109`, `:283-286`), next to counted multi-select PR-state and checks facets (`desktop/packages/ui/src/components/supervision/missionControl/MissionControlFilters.tsx:130-159`) and a palette that matches `#123` or `#PR`, scopes with Tab, and opens beside on Shift+Enter (`desktop/packages/ui/src/components/ui/CommandPalette.tsx:684-698`, `:829-840`). Orca’s kanban, cross-worktree feed, child rows, and mark-unread still cover the same scan, so the chip is +0.02 on the round-24 9.30.

**Overview — AX vs opencode.** opencode lists projects and recent sessions, with permission prompts docked on the session (`competitor-facts.md:19-22`). AX shows last-read age and a Retry that re-reads without selecting the row (`MissionControlRow.tsx:81-87`, `:210-218`), and the same row carries the waiting-page chip.

**Workspace — AX vs Orca.** The grid swaps or docks by drag (`desktop/packages/ui/src/components/sessionGrid/SessionGrid.tsx:133-152`), moves by arrow with focus following the moved pane (`:86-90`, `:175-183`), stops at four panes (`desktop/packages/ui/src/lib/supervision/sessionGrid.ts:53`, `SessionGrid.tsx:233`), and each pane header shows that session’s page origin and access and can show the page while the grid stays up (`SessionGrid.tsx:289`, `desktop/packages/ui/src/components/mcp/WebMcpPages.tsx:18`, `:76-78`, `:120-122`, `desktop/packages/ui/src/hooks/useWebMcpPages.ts:37-56`). The window still shows one page and hides the previous view (`desktop/packages/electron/src/desktop-webmcp-browser.js:255-259`), so this is 9.20: above the round-24 9.15 cluster, and below a 9.3, while Orca’s mixed-tool pane tree still arranges more surfaces.

**Workspace — AX vs opencode.** opencode is one timeline plus a resizable right panel, with no split panes (`competitor-facts.md:22`). AX keeps up to four sessions on screen, and a lost host renderer pauses that page and leaves the guest (`desktop-webmcp-browser.js:1090-1092`).

**Review — AX vs Orca.** A session file counts as reviewed only while the index holds the reviewed before-state and the worktree holds the reviewed after-state and mode (`desktop/packages/ui/src/components/views/git/ReviewLanding.tsx:75-90`), and the landing recap jumps to the step with duration and definition identity (`desktop/packages/ui/src/components/views/git/ReviewLandingBrowserEvidence.tsx:141-167`). A failed call’s collapsed row and the call strip show the redacted reason and first diagnosis finding (`desktop/packages/ui/src/lib/webMcpFailureSummary.ts:8-21`, `desktop/packages/ui/src/components/chat/message/parts/ToolPart-impl.tsx:1687`, `:1884-1891`, `desktop/packages/ui/src/components/mcp/WebMcpCallStrip.tsx:149-152`), and compare names why a runtime receipt is missing (`desktop/packages/ui/src/components/mcp/WebMcpToolPanel.tsx:323-334`). Orca’s inline three-way merge and switchable compare base remain, and receipts stay memory-only, capped at 256 (`desktop/packages/ui/src/stores/useWebMcpApprovalOutcome.ts:31-32`, `:56`).

**Review — AX vs opencode.** opencode’s verified review is a filterable tree with git, branch, and turn modes plus per-turn undo (`competitor-facts.md:23-25`). AX adds content-and-mode landing, a collapsible rail with adjustable width (`desktop/packages/ui/src/components/views/ReviewFileRail.tsx:169`, `:192-200`, `:567`), and a replay value outside the current enum is marked and takes a separate send (`WebMcpToolPanel.tsx:361-375`, `:874-886`). The fact file’s note on missing commit controls is inference, so it stays unscored.

## 2. Weighted overall

| Product | Overview | Workspace | Review | Weighted |
|---|---:|---:|---:|---:|
| AX Code Desktop | 9.32 | 9.20 | 9.28 | **9.28** |
| Orca | 9.00 | 9.00 | 8.90 | **8.97** |
| Claude Code desktop | 8.70 | 9.00 | 8.85 | **8.83** |
| Codex app | 8.20 | 8.30 | 8.85 | **8.45** |
| opencode desktop | 6.80 | 6.90 | 7.50 | **7.07** |

AX is 0.4×9.32 + 0.25×9.20 + 0.35×9.28 = 9.276, reported as 9.28. That is +0.03 on the round-24 codex and deepseek 9.25, and 0.02 under round-24 grok’s 9.30. The lead over Orca is +0.31.

**AX vs Orca: better**

**AX vs opencode: better**
