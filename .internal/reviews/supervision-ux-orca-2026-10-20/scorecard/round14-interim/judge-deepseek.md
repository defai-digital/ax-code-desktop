# Round 14 interim UX scorecard (independent, read-only)

Verified in source at HEAD; competitor claims use the supplied snapshot and unknown capabilities earn no penalty.

## 1. Per surface (1–10)

| Surface (weight) | AX | Orca | opencode | Codex | Claude |
|---|---:|---:|---:|---:|---:|
| Mission Control / overview (40%) | 9.2 | 9.0 | 6.5 | 8.2 | 8.6 |
| Workspace / layout (25%) | 8.9 | 9.0 | 7.0 | 8.2 | 9.0 |
| Review changes (35%) | 9.15 | 8.85 | 7.4 | 8.8 | 8.8 |

**Overview — vs Orca.** AX keeps the intervention edge: one answerable inbox with armed batch decisions (`NeedsYouPopover.tsx:110-147`, `PermissionBatchBar.tsx:28-67`), Retry and last-read age on stale previews (`MissionControlRow.tsx:80-86,189-215`), and PR/CI, checks and budget on rows (`MissionControlRow.tsx:279-281`). Orca still has wider multi-select PR/MR facets and a Cmd-J palette with split-open and #PR (`competitor-facts.md:5,10`), while AX's palette only ranks sessions (`CommandPalette.tsx:550-563`), so the lead is narrow.

**Overview — vs opencode.** opencode offers per-session permission docks and no board (`competitor-facts.md:19-21`), so twenty sessions cost twenty inspections. AX answers requests and reads preview, checks and change evidence from one grid.

**Workspace — vs Orca.** AX now shows agent page calls with outcome, duration and page generation, a schema/hint/lint/registration tool panel, and pause/take-over (`WebMcpCallStrip.tsx:32-117`; `WebMcpToolPanel.tsx:144-232,599-618`; `EmbeddedWebMcpBrowser.tsx:460-508`), which Orca's browser pane cannot express. But the grid is four fixed layouts with ratio splitters (`SessionGrid.tsx:69-90`), no page-switcher UI exists at HEAD (multi-view state in `useWebMcpBrowserStore.ts:109-113,225-263` is only selected by the pane), and waiting calls surface only inside the pane, so Orca's pane trees still win on arrangement.

**Workspace — vs opencode.** opencode documents one centre column plus a resizable right panel and no split (`competitor-facts.md:22`). AX runs up to four sessions, each embedding that session's own surface (`SessionGrid.tsx:22-50`) plus page-tool inspection, a clear advantage.

**Review — vs Orca.** AX now lands from This session and Last turn only while the reviewed bytes and file mode still match (`ReviewLanding.tsx:74-115,209-251`; mounted `SessionChangesView.tsx:419-435`), and the rail is a collapsible tree with keyboard-adjustable width (`ReviewFileRail.tsx:516-574`). Orca retains switchable base and inline three-way merge (`competitor-facts.md:13-14`), but AX's content-bound preflight and persisted threads make the higher-risk landing task safer.

**Review — vs opencode.** opencode's review is read/comment with git/branch/turn modes and turn undo/redo, with no documented stage/commit path (`competitor-facts.md:23-25`, inference). AX adds branch/session/turn landing, content-bound staging, F7 hunk navigation and resolvable threads.

## 2. Weighted overall (overview 40, review 35, workspace 25)

AX **9.11** · Orca **8.95** · Claude 8.77 · Codex 8.41 · opencode 6.94.

**AX vs Orca: equal** — the 0.16 lead is inside the judges' ~0.1–0.15 spread and below the PRD's 0.2 bar (`PRD-2026-10-21-competitive-supervision-ux-v1.md:52`).
**AX vs opencode: better.**

## 3. Three smallest changes most likely to flip Orca

1. **Surface waiting page calls where the persona looks.** The pool already projects `waiting` (`useWebMcpPoolProjection.ts:78`) but only the pane renders it (`EmbeddedWebMcpBrowser.tsx:504-508`); add a Needs You item and a row/grid badge. Cheapest "notice and answer" gain; it also closes A8/A2's visible half.
2. **Finish the page switcher and per-session revoke.** The store already holds `views`, `order` and `activeKey` with `selectView` (`useWebMcpBrowserStore.ts:109-113,225-263`); add the list/tabs UI and revoke. Closes A8/A2 without backend work.
3. **Overview parity:** make the PR filter multi-select with counts and add host/project filter, split-open and #PR to the palette (`competitor-facts.md:5,10`). If review weight is preferred, add inline three-way merge where AX currently delegates conflicts to a session (`ConflictDialog.tsx:242-264`).

Notes: A2, A8, B2 and B4 still fail the round-13 rubric; I take no credit for round-14 work absent at HEAD. The pasted `webmcp:check` exit 64 is the script's documented usage exit without `--url` (`webmcp-check.mjs:4,17`), not a failing gate. No competitor app was run; competitor facts are the supplied snapshot.