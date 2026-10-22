我先讀評分證據與近期原始碼，再獨立核對 AX 的監督體驗宣稱。第 28 輪的程式變更很小。我對照 HEAD 的原始碼，確認監督者看得到的行為有沒有真的改變。Round 28 judgment at HEAD `e36aad55`. Competitor scores use `competitor-facts.md` only. Against this judge’s round 24 scores at `5193b0c8` (AX 9.30 / 9.29 / 9.32, weighted 9.30), overview and workspace stay at the round 26 levels. Review stays at 9.32. Commit `0f559df5` adds no new supervision control.

## 1. Surface scores

| Surface (weight) | AX | Orca | opencode | Codex app | Claude Code |
|---|---:|---:|---:|---:|---:|
| Mission Control / overview (40%) | **9.34** | 9.00 | 6.80 | 8.20 | 8.70 |
| Workspace / layout (25%) | **9.33** | 9.00 | 6.90 | 8.30 | 9.00 |
| Review changes (35%) | **9.32** | 8.90 | 7.50 | 8.85 | 8.85 |

**Overview — AX vs Orca.** A hidden waiting page is a warning chip on that row, using the same rule as Needs you (`desktop/packages/ui/src/lib/webMcpViewKey.ts:24`, `MissionControlRow.tsx:106-109`, `:283-286`), beside counted multi-select PR-state and checks facets (`MissionControlFilters.tsx:130-159`). The chip names the page as waiting, so the blocked call stays inside the session; Orca’s kanban, feed, and child rows (`competitor-facts.md:4-9`) still match a glance, and the AX edge is that queue plus a stale preview age and a Retry that only re-reads (`MissionControlRow.tsx:81-87`, `:210-223`, `useRemoteActivityPreviews.ts:15-17`).

**Overview — AX vs opencode.** opencode has no multi-agent board and keeps permission prompts on the session (`competitor-facts.md:19-22`). AX puts last-read age and that Retry on the preview line, and the row’s page button shows origin, access, and Show (`WebMcpPages.tsx:181-198`).

**Workspace — AX vs Orca.** Drag swaps or docks, arrows move focus with the session, the grid stops at four panes, and each pane can show and open that session’s page while the grid stays up (`SessionGrid.tsx:143-152`, `:176-183`, `:289`; `sessionGrid.ts:53`, `:447-464`; `WebMcpPages.tsx:120-122`); another window cannot take a live page, and a lost host renderer pauses it (`desktop-webmcp-browser.js:922-924`, `:1098-1100`). Revoke stays on the full switcher (`WebMcpPages.tsx:129`); round 28 keeps the current binding after a cancelled close and masks a sensitive Try-it value by content (`desktop-webmcp-browser.js:415-422`, `:495-498`, `:559-570`; `WebMcpToolPanel.tsx:356`, `:393-401`). Orca’s recursive terminal, editor, browser, and diff tree remains the broader arranger (`competitor-facts.md:11-12`).

**Workspace — AX vs opencode.** opencode is a timeline plus one resizable right panel and does not split panes (`competitor-facts.md:22`). AX keeps four sessions on screen, and a collapsed page-tool row states the failure (`ToolPart-impl.tsx:1682-1687`).

**Review — AX vs Orca.** This session and Last turn stage a file only while the mark, the index before-blob, the worktree after-blob, and the file mode still match (`ReviewLanding.tsx:75-90`), and the recap beside landing opens the step with duration and definition identity (`ReviewLandingBrowserEvidence.tsx:141-176`). Round 28 masks an echoed sensitive value under any key, including an encoded echo (`desktop/shared/webmcp-redaction.mjs:153`, `:173-174`, `:208-209`); landing actions are unchanged, receipts stay memory-only and capped at 256 (`useWebMcpApprovalOutcome.ts:45-56`), and Orca still has inline three-way merge and a switchable compare base (`competitor-facts.md:13-14`).

**Review — AX vs opencode.** opencode’s verified review is a filterable tree, git, branch, and turn modes, and per-turn undo (`competitor-facts.md:23-25`). The note that commit controls are missing is inference and stays unscored. AX binds Stage, Commit, and Push to the reviewed bytes and uses a collapsible rail whose width follows the pointer and the arrow keys (`ReviewFileRail.tsx:169`, `:279-327`).

## 2. Weighted overall

| Product | Overview | Workspace | Review | Weighted |
|---|---:|---:|---:|---:|
| AX Code Desktop | 9.34 | 9.33 | 9.32 | **9.33** |
| Orca | 9.00 | 9.00 | 8.90 | **8.97** |
| Claude Code desktop | 8.70 | 9.00 | 8.85 | **8.83** |
| Codex app | 8.20 | 8.30 | 8.85 | **8.45** |
| opencode desktop | 6.80 | 6.90 | 7.50 | **7.07** |

The raw AX sum is 9.331. Rounded scores leave the lead over Orca at +0.36, up 0.03 from this judge’s round 24. The movement is the round 26 hidden-page chip and per-pane page status. Round 28’s echo mask and cancelled-close binding hold trust. They do not widen a surface. Competitor facts are unchanged, so those scores stay put.

**AX vs Orca: better**

**AX vs opencode: better**
