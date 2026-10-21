我先讀評分依據與第 15 輪結果，再對照 HEAD 原始碼核對第 15–17 輪宣稱的功能，不會改任何檔案。第 15 輪已把 AX 評在 Orca 之上。我接著核對 HEAD 上的格子、篩選、指令面板，以及第 16–17 輪 WebMCP 加固是否真的改到監督體驗。Round 17 judgment at HEAD `7f63b436`. Competitor scores use `competitor-facts.md` only. Unknown capabilities are not weaknesses. Rounds 16–17 harden WebMCP (redaction, sign-in, unsaved work, whole-turn copy). Both final audits report no P1. Overview and grid behavior are unchanged from round 15.

## 1. Surface scores

| Surface | AX | Orca | opencode | Codex | Claude |
|---|---:|---:|---:|---:|---:|
| Mission Control / overview (40%) | **9.3** | 9.0 | 6.8 | 8.2 | 8.7 |
| Workspace / layout (25%) | **9.15** | 9.0 | 6.9 | 8.3 | 9.0 |
| Review changes (35%) | **9.2** | 8.9 | 7.5 | 8.85 | 8.85 |

**Overview — AX vs Orca.** AX keeps a two-group PR facet with counts (`MissionControlFilters.tsx:130-159`) and a palette that matches `#123` or `#PR` (`CommandPalette.tsx:684-698`), scopes with Tab (`:829-831`), and opens beside on Shift+Enter (`:833-840`). Stale activity still shows its age and a Retry that does not open the row (`MissionControlRow.tsx:81-87`, `:205-216`). Orca's documented kanban and Cmd-J palette stay in the same band.

**Overview — AX vs opencode.** opencode has no multi-agent board, and permission prompts stay on the session (`competitor-facts.md:19-21`). AX's board, facets, and Retry are what this persona uses to notice work across 5–20 sessions.

**Workspace — AX vs Orca.** Drag swaps on the center and docks on an edge (`SessionGrid.tsx:142-151`, `sessionGrid.ts:447-459`). Arrow moves announce the move and focus follows the pane (`SessionGrid.tsx:86-89`, `:175-182`, `:248-258`). Split stops at four (`sessionGrid.ts:53`, `:462-464`). Pop-out refuses a second owner (`sessionGridPopout.ts:57-60`; `desktop-webmcp-browser.js:1200`, `:1213-1215`). Preset ratios persist (`sessionGridPreferences.ts:40-49`). Sign-in popups hold the agent (`desktop-webmcp-browser.js:511`, `:651-664`), eviction keeps possible unsaved work (`browser-eviction.js:5-32`), and pause reports stopped versus still-finishing calls (`desktop-webmcp-browser.js:317-354`). Orca's recursive pane tree remains the more general arrangement, so the lead is the page-tool model, not the grid.

**Workspace — AX vs opencode.** opencode is one timeline plus a right panel and has no split panes (`competitor-facts.md:22`). AX shows up to four sessions, each able to keep its own page.

**Review — AX vs Orca.** A session file counts as reviewed only while the index holds the reviewed before-state and the worktree holds the reviewed after-state and mode (`ReviewLanding.tsx:75-90`). The recap jumps to the call with duration and definition identity. The on-screen list caps at 50, and the copy is the whole turn (`ReviewLandingBrowserEvidence.tsx:16`, `:96-118`, `:152-174`). Approval cards show that page's definition, labelled as the page's claim (`WebMcpApprovalToolInfo.tsx:25-58`), and shorten the description to 200 characters (`:95`). Orca documents inline 3-way merge and a switchable compare base. AX sends conflicts into a session prompt (`ConflictDialog.tsx:138-146`), and the branch base is a remembered branch name (`BranchChangesView.tsx:261-289`).

**Review — AX vs opencode.** opencode's verified review is a filterable tree with git, branch, and turn modes plus turn undo. AX adds content-and-mode landing and a browser recap beside that action. Missing commit controls are only an inference, so they are not scored as a weakness.

## 2. Weighted overall

| Product | Overview | Workspace | Review | Weighted |
|---|---:|---:|---:|---:|
| AX Code Desktop | 9.30 | 9.15 | 9.20 | **9.23** |
| Orca | 9.00 | 9.00 | 8.90 | **8.97** |
| Claude Code desktop | 8.70 | 9.00 | 8.85 | **8.83** |
| Codex app | 8.20 | 8.30 | 8.85 | **8.45** |
| opencode desktop | 6.80 | 6.90 | 7.50 | **7.07** |

Round 15 scored AX 9.18–9.28 and Orca 8.93–8.98, with every judge at or above a 0.20 lead. This round is +0.26. Hardening makes the same workspace and review evidence safer. It does not add a new overview or arrangement capability.

**AX vs Orca: better**

**AX vs opencode: better**
