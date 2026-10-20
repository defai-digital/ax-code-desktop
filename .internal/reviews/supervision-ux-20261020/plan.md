# Supervision UX implementation plan

Baseline: 1ec92046; clean main worktree. Scope: Mission Control, Workspace and Review changes.

Evidence: native WebMCP baseline with two same-name projects; desktop screenshots at 1280, 800 and 600 CSS pixels. Project labels already include disambiguating paths. Primary action names still collide. Details are keyboard-only for ordinary running/goal rows. Workspace navigation disables review for drafts despite DiffView using an effective directory that supports drafts.

1. Expose a visible Details disclosure on every board row. Give every row action session/project context. Restore board focus when Escape removes a focused detail control; keep modified shortcuts and child controls independent of board navigation. Verify disclosure and target identity with mounted tests and native WebMCP.
2. Enable repository review from a selected draft directory and display that effective directory in Workspace/Review navigation. Preserve existing Files guards and the persistent chat. Test active states, no-directory disablement and draft review.
3. Show the actual effective directory in the Changes pane, with wrapping header controls. Verify populated diffs and return navigation on two projects, plus narrow/light/dark screenshots and control bounds.
4. Run focused and full UI tests, typecheck, lint, boundaries, locales, build and native WebMCP journeys. Review the final patch with an available requested model, reproduce any findings, then commit scoped paths.

Research: W3C APG grid pattern (https://www.w3.org/WAI/ARIA/apg/patterns/grid/) calls for deliberate focus management and preserving embedded controls' own keyboard interactions. This change is not a claim of complete grid-pattern conformance or screen-reader certification.

External review: Muse attempted with shell/writes disabled; terminal API 429 quota exhaustion. Grok running with tools and subagents disabled. DeepSeek via AX Code is a fallback advisory review. Outputs are leads, not verification.

## Expanded design decision (user-authorized)

The user explicitly authorized larger UI/UX changes and requested discussion with Grok and Claude Code. Both completed independent design discussions and patch reviews (saved alongside this plan).

- Adopt a separate title/action header and scope/view controls, followed by search and status facets. Preserve existing working-set behavior.
- Adopt Claude's single-select facets and counts over scope plus query. Grok proposed multi-select OR and counts ignoring query; that adds ambiguity and state for this iteration. Visible = scope AND query AND status. Attention includes permission, question, error and blocked goal; review is a separate non-overlapping facet. Idle remains in All where the scope allows it.
- Keep global WIP and an explicit hidden-needs-you recovery link. Reset query, status and working-set scope to Live to reveal hidden actionable sessions. A no-match state resets query/status without changing scope.
- Search session title, goal objective, project label and directory without relevance reordering. Keep selected identity and native editable keys. `/` focuses search; Escape clears search, then returns focus to the board. Details remain directly clickable.
- Use actual pane width for automatic diff layout and file-sidebar visibility. Keep explicit user layout preferences; do not silently rewrite them on resize.
- At workspace widths up to 56rem, hide the mounted chat and divider with CSS and give Review the full workspace. Workspace navigation returns to chat. Preserve the split ratio and all nodes across responsive resizing; keep keyboard focus visible.
- Display effective directory once in Workspace, once inside Review, and preserve duplicate-project context in row actions.
- Defer unrelated runtime state, bulk actions, saved filters, dependency changes and a new navigation routing system.

## Review reconciliation

Both patch reviewers saw diff excerpts and hypothesized that editable keys could reach the `/` handler and that DiffView had early top-level returns. Full source inspection disproves those: the editable guard precedes `/`; the early returns belong to renderContent and the measured root always mounts. Mounted typing tests and native pane readback verify these paths. The named `workspace` container already exists.

Accepted findings: stale hidden peek state, shifted-slash/IME handling, focus when responsive CSS hides chat, and duplicate directory text. Fixes and behavioral tests cover them. No reviewer result is treated as execution evidence. Muse quota exhaustion and DeepSeek timeout are recorded as unavailable reviews.
