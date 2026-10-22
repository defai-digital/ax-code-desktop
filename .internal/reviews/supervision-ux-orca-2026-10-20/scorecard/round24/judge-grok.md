我先讀評分證據與原始碼，核對第 15 到 24 輪的主張後再獨立給分。第 21 輪分數已讀完。我接著核對第 22–24 輪在原始碼裡是否真的改變監督者看得到的行為。Round 24 judgment at HEAD `5193b0c8`. Competitor scores use `competitor-facts.md` only. Against round 21 grok (AX 9.30, Orca 8.97, +0.33), overview and review stay put. Workspace moves from 9.28 to 9.29.

## 1. Surface scores

| Surface | AX | Orca | opencode | Codex | Claude |
|---|---:|---:|---:|---:|---:|
| Mission Control / overview (40%) | **9.30** | 9.00 | 6.80 | 8.20 | 8.70 |
| Workspace / layout (25%) | **9.29** | 9.00 | 6.90 | 8.30 | 9.00 |
| Review changes (35%) | **9.32** | 8.90 | 7.50 | 8.85 | 8.85 |

**Overview — AX vs Orca.** AX answers from counted multi-select PR-state and checks facets (`desktop/packages/ui/src/components/supervision/missionControl/MissionControlFilters.tsx:130-159`) and a palette that matches `#123` or `#PR`, scopes with Tab, and opens beside on Shift+Enter (`desktop/packages/ui/src/components/ui/CommandPalette.tsx:684-698`, `829-840`). Rounds 22–24 leave the board as it was, and Orca’s kanban, child rows, cross-worktree feed, and mark-unread stay in the same band.

**Overview — AX vs opencode.** opencode lists projects and recent sessions, with permission prompts docked on the session (`competitor-facts.md:19-22`). AX shows last-read age on a stale preview and a Retry that re-reads without selecting the row (`desktop/packages/ui/src/components/supervision/missionControl/MissionControlRow.tsx:81-87`, `205-218`).

**Workspace — AX vs Orca.** The grid swaps or docks by drag (`desktop/packages/ui/src/components/sessionGrid/SessionGrid.tsx:133-151`), moves by arrow with focus following (`:175-182`), stops at four panes (`desktop/packages/ui/src/lib/supervision/sessionGrid.ts:53`, `462-464`), and shows one page per window (`desktop/packages/electron/src/desktop-webmcp-browser.js:255-259`). A lost host renderer now pauses that page, keeps the guest, and leaves other owners running (`:1090-1092`; `desktop/packages/electron/src/desktop-webmcp-browser.test.mjs:3362-3380`, `3403-3410`), and a later close still asks (`desktop-webmcp-browser.js:541-556`); Orca’s recursive mixed-tool pane tree keeps the move to 9.29.

**Workspace — AX vs opencode.** opencode is one timeline plus a resizable right panel, with no split panes (`competitor-facts.md:22`). AX keeps up to four sessions on screen, and a crashed host leaves that agent’s page in place and paused (`desktop-webmcp-browser.js:1090-1092`).

**Review — AX vs Orca.** A session file counts as reviewed only while the index holds the reviewed before-state and the worktree holds the reviewed after-state and mode (`desktop/packages/ui/src/components/views/git/ReviewLanding.tsx:77-90`), and the landing recap jumps to the step with duration and definition identity (`desktop/packages/ui/src/components/views/git/ReviewLandingBrowserEvidence.tsx:141-167`). Bracketed-assignment and nested-field redaction (`desktop/shared/webmcp-redaction.mjs:72-80`, `159-173`) stays inside the 9.32 already given for that recap; Orca’s inline three-way merge and switchable compare base remain, and receipts stay memory-only, capped at 256 (`desktop/packages/ui/src/stores/useWebMcpApprovalOutcome.ts:31-56`).

**Review — AX vs opencode.** opencode’s verified review is a filterable tree with git, branch, and turn modes plus per-turn undo (`competitor-facts.md:23-25`). AX adds content-and-mode landing and a collapsible rail with adjustable width (`desktop/packages/ui/src/components/views/ReviewFileRail.tsx:169`, `192-200`, `567-570`). The fact file’s note on missing commit controls is inference, so it stays unscored.

## 2. Weighted overall

| Product | Overview | Workspace | Review | Weighted |
|---|---:|---:|---:|---:|
| AX Code Desktop | 9.30 | 9.29 | 9.32 | **9.30** |
| Orca | 9.00 | 9.00 | 8.90 | **8.97** |
| Claude Code desktop | 8.70 | 9.00 | 8.85 | **8.83** |
| Codex app | 8.20 | 8.30 | 8.85 | **8.45** |
| opencode desktop | 6.80 | 6.90 | 7.50 | **7.07** |

The raw AX sum is 9.304, up from 9.302 in round 21. Rounded weighted scores leave the lead over Orca at +0.33. The hundredth on workspace is page retention and pause when the host renderer is lost.

**AX vs Orca: better**

**AX vs opencode: better**
