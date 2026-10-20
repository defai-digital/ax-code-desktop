# Design review: AX Code Desktop supervision UI (Round 1)

Read-only, English, within budget. Citations to competitor patterns are best-effort from memory; anything I can't verify is flagged as a guess.

## 1. Six highest-impact UX defects (ranked)

1. **No project grouping in Mission Control.** Five–twenty flat rows across N projects is the actual workload; the current board is a single un-grouped table. This is the single biggest blocker for the stated use case.
2. **Absolute filesystem paths leak everywhere** (`/private/var/folders/…`, two-line wraps) on the board, in the sidebar, and in the diff header. Breaks density, leaks machine internals (macOS temp paths), and conveys no useful info beyond the repo.
3. **Two near-identical row CTAs ("open" + "details").** Same intent, both primary-styled. One action per row is the rule; details belong in an inspector pane.
4. **Review Changes has no review loop.** No file list, no "reviewed 3 of 8" progress, no inline hunk comment composer surfaced in the diff view itself, no stage-and-commit box next to the diff. `DiffCommentSummaryBar` exists but is undiscoverable (guess: it was added without re-routing the primary review flow through it).
5. **Top nav is tabs that hide the supervisor surface.** Mission Control is the home for this product; making the home a tab with two siblings of equal weight inverts the IA. Tabs also force a full page switch to glance at a different session.
6. **Density selector + status chips + "Showing X of Y" + ⌘-hint string** are competing density/Affordance signals on the second/third rows. The board reads as a settings panel, not a dashboard.

## 2. Concrete redesigns

**Mission Control (home, not a tab).**
- Left rail: project list, each row shows project name + per-project state counts (`2 needs you · 1 running`); working-set groups as labeled subgroups ("Today", "Blocked on review", "Long-running"). Keyboard focus moves rail → board.
- Center: cards grouped by project, card shows state pill, project + branch, title + 1-line goal excerpt, age, single primary "Open" (Enter) with kebab-menu secondaries. No absolute paths.
- Right inspector (single, no disclosure): goal text, last agent message, evidence summary, inline comment field → returns comment to agent. Selecting a card populates it.
- Header: title, "Dispatch new…" primary, single global "X need attention" chip; remove "⌘+⇧+H" raw text.
- Empty: illustration + "Add a project" CTA. Narrow (≤480px): rail collapses into a select.
- Orca-style: persistent task pool with state pill, ETA, attached files (guess on attached-files detail; the API list is unclear). opencode desktop does not have a real dashboard — guessing chat-centric (verified only by its absence here).

**Workspace.**
- Drop the directory line entirely. Header: project name, branch (with last-commit short SHA), "last activity 3m ago". Chat occupies left two-thirds; right dock tabs unchanged in count but Files/Diff/Git/Terminal/Context relabeled and (in step 4) co-located with the review surface.

**Review Changes.**
- Three panes: persistent file list (left) · diff (center, sticky file header with copy-path) · comment thread (right).
- File list rows: filename, +N/−M, viewed ✓ / comments ⌗ count.
- Above list: "Reviewed 3 of 8" progress + unreviewed/in-progress/done segmented.
- Below diff: stage-and-commit box (move from Git tab) and per-hunk composer.
- Codex-desktop-style: comment threads gated per file, submit review with ⌘↵ (verify this is the Codex pattern; I'm partially guessing). Claude Code desktop is mostly TUI — guessing it has nothing here to learn from.

## 3. Implementable steps (≤1 day each)

1. **`ProjectLabel`** — replace absolute paths with project + branch + relative path. `desktop/packages/ui/src/components/supervision/ProjectLabel.tsx`, feed it `useProjectRegistry()`.
2. **`MissionControlBoard` grouping** — group by project, render `ProjectGroupHeader` + rows. New `supervision/ProjectGroupHeader.tsx`, hook `useMissionControlGroups.ts`.
3. **Single-CTA rows** — open button + kebab; remove separate Details. Touch `MissionControlBoard.tsx` and `SidebarSessionItem.tsx`.
4. **Stage/commit box into Review Changes** — relocate from right-dock `Git` tab into diff footer. Touch the dock tab component + new `ReviewDiffFooter.tsx`.
5. **`ReviewFileList` rail + progress indicator** — new component, wire to existing diff state.
6. **Inline hunk comment composer** — promote `DiffCommentSummaryBar` to permanent composer in diff view; submission writes back via existing `sendToAgent` channel.
7. **Keyboard shortcuts overlay** — `⌘+/` opens a sheet listing j/k/o/c/d/s/⌘↵; replace raw ⌘+⇧+H hint with the same.
8. **Chrome audit** — drop "Showing X of Y", consolidate chips, remove the Density selector (or move to settings). One PR across `MissionControlBoard.tsx` + `SidebarShell.tsx`.

## 4. What NOT to build

A live multi-reviewer / WebSocket collaborative review surface. A single supervisor doesn't need it; the engineering cost (CRDT or comment-locking, presence, conflict resolution) would derail all six fixes above and re-shape the data model — exactly the kind of contract this brief says we cannot add.