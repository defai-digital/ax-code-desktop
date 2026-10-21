I have sufficient verified evidence. Writing the final judgment.

## Round 14 independent judgment (verified at HEAD)

**Evidence verified in source:** reviewed-identity gating at `git/ReviewLanding.tsx:77-91` (index holds `before` + regular mode, worktree holds `after`, mode equality, new file = `100644`), session/turn scopes at `:33` and checks+recap at `:380-387`; rail tree + collapsed dirs + clamped draggable width at `ReviewFileRail.tsx:160-200`; stale preview text `(may be outdated; last read {age})` + Retry at `messages/en.ts:3432-3435`, wired without opening the row (`MissionControlRow.test.tsx:482-484`); PR facet is single-select (`MissionControl.tsx:114`, checkbox list of `open|failing` at `MissionControlFilters.tsx:123-135`) though facet counts follow other filters (`MissionControl.tsx:154-156`); grid is fixed layouts 1/2/3/4 with clamped ratios, no drag-to-split/reorder/pop-out (`lib/supervision/sessionGrid.ts:3,27,63-67`); conflicts delegate to a session, no inline three-way merge (`ConflictDialog.tsx:176-180`); WebMCP multi-page store with per-view keys, switcher, revoke, named `liveViews/maxLiveViews` capacity and LRU unload copy (`useWebMcpBrowserStore.ts:118-123,244-254`, `messages/en.ts:15-16,26-28`); builder CLI is `pnpm run webmcp:check` (`package.json:40`).

### 1. Surface scores (AX / Orca / Codex / Claude / opencode)

**Overview / Mission Control** — AX **9.3** · Orca **8.9** · Claude **8.7** · Codex **8.2** · opencode **6.9**
AX beats Orca on what a supervising human needs first: previews for sessions never opened, with an honest stale age and a Retry that answers the question without opening the row (`en.ts:3432-3435`, `MissionControlRow.test.tsx:482-484`), plus runtime verification evidence on rows. Orca still has multi-select facets across PR/MR **and** a worktree-jump palette ordered needs-you>done>idle (`competitor-facts.md:5,10`); AX's PR facet is single-value (`MissionControl.tsx:114`), so Orca wins on filtering fluency. Versus opencode, AX's board is categorical — opencode has no multi-agent board at all (`competitor-facts.md:19`).

**Workspace / layout** — AX **8.8** · Orca **9.0** · Claude **8.8** · Codex **8.5** · opencode **7.2**
AX's grid of up to four live sessions with per-session Chat/Changes/Files/Terminal is close to Orca's per-worktree pane trees, and AX's page switcher keeps one page per session (`useWebMcpBrowserStore.ts:118-123`). But AX's layout is fixed — four enumerated layouts with clamped ratios (`sessionGrid.ts:3,27,63-67`) — while Orca and Claude both drag to split, reorder and pop out (`competitor-facts.md:12,36`). That is the one surface where Orca still leads. opencode has no split panes at all (`competitor-facts.md:22`).

**Review changes** — AX **9.2** · Orca **8.9** · Claude **8.8** · Codex **8.7** · opencode **7.6**
AX's landing action is bound to reviewed content identity, not to a checkbox: a file stages only while the index holds the reviewed `before` and the worktree the reviewed `after`, with mode equality enforced (`ReviewLanding.tsx:77-91`), and unreviewed staging needs a second explicit click (`:117-130`). Orca has inline three-way merge (`competitor-facts.md:13`); AX instead delegates conflicts to a session (`ConflictDialog.tsx:176-180`). opencode has no stage/commit/push in review at all (`competitor-facts.md:25`).

### 2. Weighted overall (overview 40 / review 35 / workspace 25)

| Product | Weighted |
| --- | --- |
| **AX Code Desktop** | **9.13** |
| Orca | 8.92 |
| Claude Code desktop | 8.75 |
| Codex app | 8.44 |
| opencode desktop | 7.14 |

**AX vs Orca: better** (+0.21)
**AX vs opencode: better** (+1.99)

### 3. Smallest changes to widen the Orca margin

1. **Free pane arrangement in the grid** — let a pane split, reorder or pop out from the existing `SessionGridState` instead of enumerating four layouts (`sessionGrid.ts:3,27`). This is the only surface where Orca leads, and drag-to-split is the single feature it documents that AX structurally lacks (`competitor-facts.md:12`).
2. **Multi-select PR facet with counts** — `prFilter` is one of `all|open|failing` (`MissionControl.tsx:114`); a `Set` would match the projects facet and close the last overview gap (`competitor-facts.md:5`).
3. **Inline three-way merge** — Orca's differentiator is the only notable review feature AX delegates away (`competitor-facts.md:13` vs `ConflictDialog.tsx:176-180`).