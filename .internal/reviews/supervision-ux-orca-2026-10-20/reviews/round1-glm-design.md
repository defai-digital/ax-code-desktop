## 1. Six highest-impact defects (ranked)

1. **Absolute paths as first-class text** — `/private/var/...` in board rows, sidebar, and diff headers wraps over lines and destroys scanability at 5–20 sessions. Project name + branch should be the identity; path is a tooltip.
2. **No grouping or review state in Review Changes** — no persistent changed-files list, no viewed/unviewed progress ("3 of 8"), so multi-file review loses position. This is the core supervision loop.
3. **Action overload per row** — open + details buttons, plus header quick-dispatch, pop-out, raw `⌘⇧H`, close X. Developers can't tell the primary move. One primary action, rest in overflow/hover.
4. **Flat board doesn't scale** — rows aren't grouped by project; with parallel sessions across repos the list is undifferentiated noise.
5. **Runtime jargon promoted over outcomes** — "125 of 500 tokens used, 375 left" is not what a supervisor scans for; branch, changed-file summary, and blocker reason are.
6. **Hidden review affordances** — DiffCommentSummaryBar exists but is undiscoverable; Density is a native `<select>` beside a segmented control; keyboard hints are literal text instead of tooltips/focus flow.

## 2. Redesigns

**Mission Control → project-grouped board.** Collapsible project sections (like Codex desktop's task cards grouped by repo — confident about repo/branch-per-task shape, less about exact chrome). Row = status pill · session title · branch badge · `+N −M` summary · age · one **Open** button; secondary actions (details, add to working set) in a hover/overflow menu. Token meter moves into the details disclosure as a thin bar. Default filter "Needs you". Empty state: "All sessions are running" with a single dispatch entry. Keyboard: ↑/↓ move, Enter open, `Space` expand.

**Workspace.** Header becomes `Project · branch` with path in tooltip (guessing opencode does cwd-labels in its session list — verify). Keep chat primary; add a slim right rail: changed files mini-list + current exception, so supervision context survives scrolling.

**Review Changes → three-pane review.** Persistent file tree (viewed checkbox, ±stat) | diff | comment dock; header shows "3/8 viewed". Line-select → "Ask the agent" routes through the existing session message path — no new runtime contract. Orca (stablyai) is low-confidence for me; I can't verify its review layout without fetching it — flagging as a guess. Claude Code desktop's approve-per-change and Codex's diff-then-approve loop (moderately confident) both support: review progress + a single terminal action (approve/commit) per session.

## 3. Implementable steps (<1 day each)

1. Replace absolute paths with project+branch badges (tooltips) — `components/supervision/*` row/header components, `components/views/*` diff header; add i18n keys ×14 locales.
2. Collapse row actions to primary + overflow menu — same supervision files + row tests.
3. Group board by project, collapsible, persisted filter state — supervision board + filter store.
4. Demote token meter to details; promote branch + change summary in row — row components.
5. Add persistent changed-files rail with viewed state (UI-local state only) — `components/views/` diff container.
6. Surface line-comment flow on selection; wire to existing DiffCommentSummaryBar — diff components.
7. Review progress indicator ("3/8 viewed") in diff header — diff header component.
8. Keyboard flow (↑/↓/Enter/C) + tooltips replacing raw hint text — board + shared focus hook.

## 4. What NOT to build

A full PR-review engine: persistent inline comment storage, new annotation protocol, or a second diff renderer. Tempting because it "completes" review UX, but Desktop supervises — it doesn't own review persistence or the diff engine; that belongs to the AX Code runtime/session contract. A bespoke renderer also forks maintenance away from the pinned worker renderer and its capability contract. Keep comments riding the existing session channel; keep stage/commit in the Git tab.

**Verification note:** each step above needs fresh WebMCP state reads + DOM/screenshot evidence per `docs/development-webmcp.md`, a11y names unique per row, and locale keys present in all 14 locales (`pnpm run check:locales`) before claiming done.