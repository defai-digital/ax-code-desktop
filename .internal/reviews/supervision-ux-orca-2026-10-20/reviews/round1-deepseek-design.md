## 1. Ranked defects (supervising 5–20 sessions)

1. **Rows don't answer "what changed, what needs me."** No branch, no diff stat unless evidence exists, literal `—`, and `open` + `details` + `open session` + `Add to working set` all competing. Triage is the product; the row can't be triaged.
2. **Three stacked toolbars before the first row.** Title bar, Density `<select>` + Live/Recent/+, then search + chips + "Showing 2 of 2". Density is a preference wearing a toolbar's clothes; the count line is noise when the list is the answer.
3. **Absolute paths (`/private/var/…`) wrapping across lines** in the board, sidebar, and diff header. Highest-value width spent on the least-scannable string.
4. **No grouping or ordering by project/urgency.** A flat list of 20 is a log, not a board. Project, branch, and aggregate diff belong to grouping, not to every cell.
5. **Review Changes isn't completable in one place.** No persistent changed-files rail, no "3 of 8 viewed", stage/commit lives in a different tab, and the comment-to-agent path (`DiffCommentSummaryBar`) is undiscoverable. Review = read → annotate → stage → hand back; today that's three tabs and a guess.
6. **Missing-data and narrow states were never designed.** `—`, wrapping paths, and 6-column grids that can't collapse are why it reads as unfinished rather than dense.

## 2. Redesign

**Mission Control.** One toolbar: search, filter chips, `⌘K`. Density → settings/overflow. List **grouped by project** with a sticky header: project name, branch, aggregate `+N −M`, needs-you count. Row is one line: status glyph → title → branch → `+N −M` → age → one primary action. Empty evidence renders nothing, not `—`. Details open in a **right peek panel** on selection (path there, full, monospace, selectable), never inline. Path shown as `project › relative/path`, full path on hover. Keyboard: `j/k` move, `Enter` open, `x` acknowledge, `/` search, `g` then project letter.

**Workspace.** Replace the raw path line with `project › branch › session`, session status inline. Keep chat full-width; move session metadata into a collapsible header.

**Review Changes.** Three panes: **left rail = changed files** (checkbox "viewed", per-file `+/−`, progress header "3 of 8 viewed"); **center = diff** with sticky file header and prev/next file; **bottom = commit box** (summary + stage-all) plus unresolved-comment count. Inline comments post straight into the session's composer as a quoted hunk reference — reuse the existing comment artifact, no new runtime contract. Keys: `n/p` file, `v` viewed, `s` stage, `c` comment.

Competitor notes: opencode's session list is status-first with one action per row — that I'm fairly confident about. Codex desktop leans on a conversation-and-diff split with a single composer. Claude Code desktop (recent) is task-list-plus-detail. **Orca specifics I can't verify without research — treat any Orca claim here as a guess**; the safe borrow is its apparent bias toward one primary action per item and grouped work, not chrome. The differentiator to beat all four: **grouping + viewed-progress + comment-to-agent in one view.**

## 3. Ordered steps (each < 1 day)

1. Collapse three toolbars into one; move Density to settings. `components/supervision/MissionControl*`.
2. Group rows by project with sticky headers + branch/aggregate diff. Same files.
3. Single-line row; drop `—`; one primary action, details → peek panel. Same files.
4. Relative-path display with full path in title/peek. Shared path helper + board + sidebar + `components/views/*Diff*`.
5. Keyboard triage (`j/k/Enter/x//`). Board root.
6. Changed-files rail with viewed checkboxes + progress header. Review view.
7. Commit box + unresolved-comment count in the review pane. Review view.
8. Discoverable inline comment → session composer. Diff + composer.

Each needs new i18n keys in all 14 locales and unique a11y names per row (use `aria-label` composed with the session title).

## 4. What I would not build

**A kanban board with drag-and-drop columns** (Needs you / Running / Done). It's the obvious "make it feel like a board" move and it's wrong: with 20 sessions you spend the day dragging cards, columns force horizontal scanning, and drag targets are the least accessible interaction in the set. Grouped list + keyboard is faster and testable without pixel drag simulation.