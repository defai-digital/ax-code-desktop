I have all the evidence I need. I've verified the round 11–26 claims directly in source at HEAD (grid drag/dock + 4-slot ceiling, palette `#PR`/scope/Shift+Enter, PR facets with counts, waiting-page chip in Mission Control + grid page switcher, content-and-mode-bound landing, collapsible adjustable review rail, WebMCP per-session pages/switcher/revoke/capacity, call recap with durations + definition identity + jump-to-step, conflict dialog without inline three-way merge). Let me compose the independent scorecard.

---

# Independent UX Scorecard — Round 27 (read-only, HEAD `1442693e`)

Verified AX claims in source this session. Uncommitted `config/`, lockfile, version pins ignored per brief.

## 1. Per-surface scores (1–10)

| Surface | AX | Orca | opencode | Codex | Claude Code |
|---|---:|---:|---:|---:|---:|
| Mission Control / overview (.40) | **9.30** | 9.00 | 6.80 | 8.20 | 8.70 |
| Workspace / layout (.25) | **9.15** | 9.00 | 6.90 | 8.30 | 8.95 |
| Review changes (.35) | **9.25** | 8.90 | 7.50 | 8.85 | 8.85 |

**Overview — vs Orca.** AX consolidates *decisions*, not just signal: counted multi-select PR-state/checks facets with removable chips and Clear all (`missionControl/MissionControlFilters.tsx:130-160`, `:250-268`), a Needs-you inbox that also counts waiting browser pages, and a per-row waiting-page chip naming the page a session holds (`MissionControlRow.tsx:106`, `:283`). Orca still matches breadth with kanban, an events feed, child rows and a jump palette, so the edge is answerability of "what needs me," not ambient awareness.

**Overview — vs opencode.** opencode has no multi-agent board and only per-session permission docks (`competitor-facts.md:19`, `:22`), so triage is structurally absent. AX adds a cross-session Activity feed with unread/mark-read, stale previews carrying a last-read age and a Retry (`MissionControlRow.tsx:193-219`; `ActivityButton.tsx:22`), and runtime checks + goal budget on rows opencode cannot project.

**Workspace — vs Orca.** Free arrangement is real: drag to swap or dock on an edge with a live drop preview (`SessionGrid.tsx:104`, `:129`, `:152`, `:417-425`), arrow-key moves with focus following the moved session (`SessionGrid.tsx:249-256`), pop-out under one browser owner (`sessionGrid.ts:347-362`, `:464`), and remembered split ratios (`SessionGrid.tsx:438-451`). Orca retains the residue: pane trees that host *any* tool type and split recursively, versus AX's supervision-specific whole-session panes capped at four (`sessionGrid.ts:53`).

**Workspace — vs opencode.** opencode has one resizable right panel and no split panes (`competitor-facts.md:22`); it cannot show two agents at once. AX shows up to four full sessions side by side, each with Chat/Changes/Files/Terminal plus per-session WebMCP page switching and revoke (`mcp/WebMcpPages.tsx:14-46`).

**Review — vs Orca.** Landing is bound to the reviewed change: mark signature, index before-blob, worktree after-blob and file mode must all still match, otherwise it falls back to an explicit second-click "Stage all N" (`ReviewLanding.tsx:77-91`, `:104-130`). Beside it sits a jumpable browser recap with durations and definition identity (`ReviewLandingBrowserEvidence.tsx:72-107`, `:139-165`), and the rail is a collapsible tree with pointer/keyboard width (`ReviewFileRail.tsx:160-200`, `:563-572`). Orca still owns inline three-way merge and an arbitrary compare ref; AX's `ConflictDialog.tsx` has no ours/theirs/base picker, only a continue operation (`:19`, `:82`), so AX wins on safely *landing* agent work, not on every comparison tool.

**Review — vs opencode.** Session and Last-turn landing plus the adjustable rail form a strong inspect-to-deliver loop (`SessionChangesView.tsx:26`, `:185-195`; `ReviewLanding.tsx:77`). opencode's verified per-turn undo/redo remains valuable, but it has no documented stage/commit/push where the diff is reviewed, so AX's byte-bound landing has no counterpart.

## 2. Weighted overall (overview .40 / review .35 / workspace .25)

| Product | Weighted |
|---|---:|
| AX Code Desktop | **9.24** |
| Orca | **8.97** |
| Claude Code desktop | **8.83** |
| Codex app | **8.45** |
| opencode desktop | **7.04** |

**AX vs Orca: better** (+0.27).
**AX vs opencode: better** (+2.20).

## 3. Smallest changes to widen the Orca margin

AX is already better than Orca, so no flip is required. To defend the thin +0.27 lead, the three highest-leverage small moves — each closing a *verified* residual Orca edge — are:

1. **Inline three-way merge in conflict resolution** (`ConflictDialog.tsx` has no ours/theirs/base UI). The single clearest surface where Orca beats AX today; an inline per-hunk picker is contained to one dialog and directly serves "land the agent's changes safely."
2. **An arbitrary compare base, not just merge-base-of-branch** (`PullRequestSection.tsx:374` gates on a base branch; a free ref/commit selector is a small addition to the existing base selector).
3. **Raise the grid beyond four panes, or host arbitrary tools per pane** (`sessionGrid.ts:53` caps at `GRID_MAX_SLOTS = 4`). The persona runs 5–20 sessions; Orca's unbounded pane trees are the only remaining workspace edge, and lifting the cap is a one-constant change.

*All cited AX lines were read in source at HEAD. Native journeys, CI and the test suites were not re-run (read-only round, no shell).*