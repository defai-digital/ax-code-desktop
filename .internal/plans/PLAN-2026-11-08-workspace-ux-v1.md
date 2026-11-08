# Workspace UX v1 implementation plan

Date: 2026-11-08. Branch: feat/workspace-ux-2026.
Base: 5d34efef. Worktree: /Users/akiralam/code/ax-code-desktop-ux-2026.

1. Record the authorized PRD and technical contract before implementation. Preserve the original worktree's unrelated
   Markdown performance edits. Install the pinned dependencies from the local store.
2. Add behavioral regressions for panel handoffs and rejected Files guards. Suspend the inspector when the project
   sidebar opens, extend narrow single-pane handling, replace overflowing tabs with a selector, and add focus/return controls.
3. Separate primary areas from workspace views; retain the existing Portfolio/Mission Control implementation and shortcuts.
   Bring projects ahead of a bounded starter list while retaining the anchored composer and existing starter operations.
4. Compact sidebar identity labels without losing same-name disambiguation, and expose source-backed retry presentation.
   Update all locale catalogs and relevant user-facing documentation.
5. Run focused tests, the full UI suite and the root gates: check:boundaries, check:locales, typecheck, lint, test, build.
   Repair failures introduced by this change; investigate any other failures rather than dismissing them as baseline.
6. Verify the built Electron UI with isolated native WebMCP: multiple projects, sidebar/inspector handoffs, editor/draft
   retention, focus and return, starter disclosure, light/dark themes and supported narrow/wide layouts. Record fresh DOM,
   screenshots, limitations and the final diff in an evidence report. The initial implementation scope excludes merge, push and release.

Implementation and the six root gates are complete. See the [verification report](../reports/UX-2026-11-08-workspace-ux-v1.md)
for native receipts and the Settings-dismissal repeatability limitation. The user subsequently authorized committing
and pushing `feat/workspace-ux-2026`; merging and releasing remain outside scope.
