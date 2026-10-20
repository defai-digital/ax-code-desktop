# Mission Control, Workspace and Review Changes UX vs Orca, opencode, Codex and Claude Code desktop

Date: 2026-10-20. Base: `641f6ded`. User feedback: Mission Control, Workspace and Review Changes were weak in UI/UX; research
Orca and improve until the experience beats opencode, Orca, the Codex desktop app and the Claude Code desktop app. Two further
user reports joined the work: a CLI-update toast covering the message box, a WebMCP "runtime declined this browser" failure that
needed a manual enable, and unreadable text in the default AutomatosX dark theme.

## Research basis

Competitor facts were collected from official docs and source (Orca `docs/site/content/docs`, `anomalyco/opencode` app packages,
learn.chatgpt.com Codex docs, code.claude.com desktop docs), with verified facts kept separate from inference. Key gaps found:
Orca groups and tints needs-you work and has file-tree review with batched notes; Codex offers Unstaged/Staged/Branch/Last-turn
review scopes; opencode has a filterable review file tree with prev/next file; Claude Code batches line comments with Cmd+Enter.

## Debugging evidence (native WebMCP, isolated profile, stub runtime, real git fixtures)

- Mission Control rows repeated full absolute paths, showed a bare "—" without evidence, had two equal buttons per row, a native
  Density select beside the scope control, and a raw "⌘ + ⇧ + H" string. Buttons render lowercase globally (`button.tsx`); the
  supervision controls now opt out with `normal-case`.
- Review offered only a dropdown to choose among 5 changed files: the file sidebar rendered only in stacked mode with a pane of at
  least 1024px and an `lg` window. A typical split review pane measured 551px.
- The CLI-update toast (`duration: Infinity`, bottom-right) sat over the composer's send controls.
- WebMCP: `enable` threw immediately when the native view had not attached yet (first bounds arrive a frame after ready, and any
  open dialog sends empty bounds). Logs show "not enrolled" followed by a manual enable, with no runtime rejection, so the
  "runtime declined this browser" copy was misleading. Enabling from chat stays a user gesture (ADR-009 decision 6; runtime
  ADR-180); changing that needs a runtime ADR first.
- Rendered-contrast probe plus a token audit of `automatosx-dark`: line numbers 1.72:1, doc comments 3.23:1, link hover 3.62:1,
  error text 4.21:1, secondary text 4.14:1 on selected rows.

## Delivered

- Mission Control: rows grouped by project (persisted toggle, collapsible headers with counts, short root path, aggregate +/−);
  keyboard order follows the visual order; one-line rows with state, title, branch, "+A −D · N files" (singular/plural), age, one
  primary action and an icon-only Details; amber/red left border for needs-you/error rows; density and grouping as toggles;
  shortcut as key chips; valid grid ownership (presentational wrappers, details as a row); screen-reader evidence text.
- Workspace: "Project › ~/short/path › branch" breadcrumb using `resolveProjectForDirectory`; full path in `title` and
  `data-workspace-directory`.
- Review: file rail in single and stacked modes from 640px with "N of M viewed", progress bar, filter, status letters, name and
  parent directory, viewed checkboxes; compact progress and a mark-viewed toggle in narrower panes; `[`/`]` previous/next file and
  `v` mark-and-advance (un-marking stays on the file); clicking the pane focuses it so shortcuts work; All/Unstaged/Staged scope
  selector in the review pane (callers that pin a scope keep it); comment hint shown only when there are changes, Cmd/Ctrl+Enter
  sends drafts outside editable fields; short directory with start truncation. Viewed marks are bounded (2000, oldest dropped)
  and reset when line counts or either status column change.
- Toasts: the composer publishes its height (owner-guarded, follows multi-line growth, off on the draft home, mini chat, mobile and
  the expanded composer); bottom toasts sit above it, capped at half the window.
- WebMCP: enable waits up to 2s for the pane to attach and be visible, is cancelled by a disconnect or runtime change while
  waiting, and the failure copy now tells the user what to do. 14 locales updated.
- AutomatosX dark: secondary text #A1A1A1, line numbers #8A8A8A, doc comments #8F8F8F, link hover #52A8FF, error #FF6369, merged
  #BF7AF0; a regression test requires 4.5:1 on every surface for these tokens.
- Shared `src/test/dom.tsx` query helpers (the UI package does not depend on Testing Library).

## Model allocation and review outcomes

Implementers worked in separate worktrees: codex (Mission Control), grok-4.7 (Review rail). glm-5.3-flash translated all new
strings (4 batches). Reviews were always by a different model than the author: deepseek-flash (Mission Control, toast, Review
rail), MiniMax-M3 (pre-implementation spec check with citations, Review acceptance, UI/UX review), mimo-v2.6-pro (a11y, verified
item by item by glm-5.3-flash), codex (workspace/group header, final regression review). Raw outputs are in `reviews/`.
Rejected claims after checking code: fallback overwriting the remembered session, collapse buttons unreachable by keyboard,
overlapping status filters, colour-only state signals, a Cmd+Enter race in React commit order. The final codex review found an
enable request surviving a disconnect during the new wait; fixed with a regression test and mutation probe. muse was unavailable
(quota until 2026-10-26); grok was unavailable until the owner refilled it.

## Verification

| Gate | Result |
| --- | --- |
| `pnpm run typecheck` / `pnpm run lint` | Passed |
| UI suite | 577 files, 3,908 tests passed |
| Electron suite | 91 files, 759 passed, 1 skipped |
| `pnpm run check:boundaries` (incl. source-text ratchet) / `pnpm run check:locales` | Passed; 14 locales, 4,971 keys |
| Native WebMCP `supervision-workspace-webmcp.mjs` | Passed: grouping/collapse, five-file fixtures, scopes, viewed progress, `]` navigation, toast clearance, 6 pane widths, dark/light |
| `portfolio-identity`, `project-home`, `agent-permissions` WebMCP journeys | Passed |
| CSP / renderer errors | Clean |

Mutation probes (guard removed, named test failed, restored): innermost project resolution, collapsed-group navigation, viewed
signature, attach wait, revision check during the wait, dark line-number contrast.

## Known limits and next steps

- Viewed marks cannot detect a rewrite with identical line counts and status; a content fingerprint needs a runtime status field.
- Not built yet (MiniMax UI/UX review, confirmed): multi-select batch actions on the board, a ranked session jump palette, and
  Branch / Last-turn review scopes (runtime data). Over-limit badge threshold (4) versus a 5-20 session goal is a product decision.
- Enabling WebMCP from chat needs an interactive-approval design in the runtime (ADR-180) before Desktop can offer it.
- Fixture paths live outside the home directory, so screenshots show full temporary paths that real projects shorten to `~/…`.
