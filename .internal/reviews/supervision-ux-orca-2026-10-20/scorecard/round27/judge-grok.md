我先讀分數卡證據與 PRD，再對照原始碼核對第 15 到 26 輪的聲稱，獨立打分。第 24 輪分數已讀完。接著核對第 26–27 輪在原始碼裡是否真的改變監督者看得到的行為。Independent read-only judgment at HEAD `1442693e`. Competitor scores use `competitor-facts.md` only. Against this judge’s round 24 scores at `5193b0c8` (AX 9.30 / 9.29 / 9.32, weighted 9.30, Orca 8.97), overview and workspace move slightly. Review stays put.

## 1. Surface scores

| Surface (weight) | AX | Orca | opencode | Codex app | Claude Code |
|---|---:|---:|---:|---:|---:|
| Mission Control / overview (40%) | **9.34** | 9.00 | 6.80 | 8.20 | 8.70 |
| Workspace / layout (25%) | **9.33** | 9.00 | 6.90 | 8.30 | 9.00 |
| Review changes (35%) | **9.32** | 8.90 | 7.50 | 8.85 | 8.85 |

**Overview — AX vs Orca.** The row already had origin, access and Show (`desktop/packages/ui/src/components/mcp/WebMcpPages.tsx:181-199`); round 26 adds a warning chip only when that page is waiting and hidden, the same rule as Needs you (`desktop/packages/ui/src/lib/webMcpViewKey.ts:24`, `desktop/packages/ui/src/components/supervision/missionControl/MissionControlRow.tsx:106-109`, `:283-286`), beside counted multi-select PR-state and checks facets (`MissionControlFilters.tsx:130-158`). The chip does not name the blocked call or answer it, and Orca’s kanban, feed and child rows still match a glance, so the edge stays one decision queue.

**Overview — AX vs opencode.** opencode has no multi-agent board and keeps permission prompts on the session (`competitor-facts.md:19-22`). AX puts last-read age and a Retry that leaves the row unselected on the preview line (`MissionControlRow.tsx:81-87`, `:210-223`).

**Workspace — AX vs Orca.** Each of up to four panes shows that session’s page and access in the header and can open it while the grid stays up (`SessionGrid.tsx:233`, `:289`, `WebMcpPages.tsx:14-18`, `:76-78`, `:120-122`, `desktop/packages/ui/src/hooks/useWebMcpPages.ts:42-56`); drag swaps or docks, arrows move focus with the session, and another window cannot take a live page (`SessionGrid.tsx:87-90`, `:143-152`, `:176-183`, `desktop/packages/ui/src/lib/supervision/sessionGrid.ts:53`, `:462-464`, `desktop/packages/electron/src/desktop-webmcp-browser.js:912-917`). Compact mode has no revoke, and the page opens in the context browser, so Orca’s recursive mix of terminal, editor, browser and diff remains the broader arranger.

**Workspace — AX vs opencode.** opencode is a timeline plus one resizable right panel and does not split panes (`competitor-facts.md:22`). AX shows four sessions at once, and a collapsed page-tool row states the failure on the row (`desktop/packages/ui/src/components/chat/message/parts/ToolPart-impl.tsx:1682-1687`).

**Review — AX vs Orca.** This session and Last turn stage a file only while the mark, the index before-blob, the worktree after-blob and the file mode still match (`desktop/packages/ui/src/components/views/git/ReviewLanding.tsx:77-90`), and the recap beside landing jumps to the step with duration and definition identity (`ReviewLandingBrowserEvidence.tsx:141-176`). Round 27 masks a sensitive field’s value wherever diagnostic prose repeats it (`desktop/shared/webmcp-redaction.mjs:126-186`) and adds no landing control; Orca still has inline three-way merge and a switchable compare base.

**Review — AX vs opencode.** opencode’s verified review is a filterable tree, git, branch and turn modes, and per-turn undo (`competitor-facts.md:23-25`); missing commit controls are inference and stay unscored. AX binds Stage, Commit and Push to the reviewed bytes and uses a collapsible rail with drag and keyboard width (`desktop/packages/ui/src/components/views/ReviewFileRail.tsx:169`, `:279-327`).

## 2. Weighted overall

| Product | Overview | Workspace | Review | Weighted |
|---|---:|---:|---:|---:|
| AX Code Desktop | 9.34 | 9.33 | 9.32 | **9.33** |
| Orca | 9.00 | 9.00 | 8.90 | **8.97** |
| Claude Code desktop | 8.70 | 9.00 | 8.85 | **8.83** |
| Codex app | 8.20 | 8.30 | 8.85 | **8.45** |
| opencode desktop | 6.80 | 6.90 | 7.50 | **7.07** |

The raw AX sum is 9.331. Rounded scores leave the lead over Orca at +0.36, up 0.03 from this judge’s round 24. The movement is the hidden-page chip and per-pane page status. Redaction and the collapsed failure line hold trust. They do not widen review.

**AX vs Orca: better**

**AX vs opencode: better**

No flip list: AX is better than Orca.
