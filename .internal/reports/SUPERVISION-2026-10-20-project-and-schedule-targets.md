# Distinct project headers and scheduled-task targets

[Plan](../plans/PLAN-2026-10-20-project-and-schedule-targets.md). Baseline: `3c9fe8d2`.

## Reproduction

- Mounted baseline: 2 failed, 12 passed (`/tmp/ax-project-targets-before.log`). Different labels `shared-project` and
  `shared_project` render identically. Project headers exposed four button actions for two headers, and scheduled rows
  omitted distinct paths/action context.
- Native baseline: `/tmp/ax-project-targets-before-verified-20261020.log` failed on ambiguous scheduled context.
  Its `targets-wide.png` and JSON show two identical Nightly rows and two Shared Project headers. The first setup attempt
  incorrectly assumed that a desktop-only sentinel was always present; it was corrected before the negative receipt.
- Post-repair native screenshots reproduced a separate visual defect: Projects Home's title overlapped its unwrapped
  toolbar at 800 CSS pixels with the sidebar open (`/tmp/ax-project-targets-final-20261020/targets-800.png`).

## Repairs

- Compare project names after sidebar formatting, so both explicit and default-name collisions receive visible path
  context. Unique names stay concise. The task project picker and editor retain the same context; the editor path wraps.
- Put sortable attributes and the activator ref on the actual header button with its existing listeners. The wrapper
  no longer exposes a second inert action. The real header describes its expanded state, and duplicate-label header
  actions include the project context.
- When a scheduled task title occurs in another directory, include its project context in edit/run/pause/resume/more
  names. The canonical task IDs and directory-specific mutation functions are unchanged. Mounted tests verify both exact
  pause destinations even when task IDs match.
- Projects Home's heading and action group wrap within their container. Icon-only toolbar controls retain explicit
  accessible names when their visible labels are hidden by a breakpoint.
- The two-project stub scopes scheduled definition/history reads by directory, including duplicate task IDs. Its create
  and update routes keep their original single-project admission; this journey opens/cancels editors and never submits.

## Verification

- Focused sidebar/editor tests: 15 files, 83 tests passed (`/tmp/ax-project-targets-ui-final.log`).
- Scoped fixture/harness tests: 2 files, 36 tests passed (`/tmp/ax-project-targets-fixture.log`).
- UI typecheck passed (`/tmp/ax-project-targets-typecheck.log`).
- Initial native repair journey passed (`/tmp/ax-project-targets-final-20261020.log`): distinct prompts for both editors,
  isolated project collapse/restore, new-task destination, 800px/600px context, light theme and no scheduled writes.
  Runtime project IDs and Desktop registry IDs are different domains; an initial post-repair setup assertion confused
  them. The corrected journey resolves observed controls by directory and records registry IDs separately.
- Inspected populated narrow, light and project B editor screenshots. Paths are readable at the cost of row height.
  The full path remains visible in the editor instead of being truncated.

- Complete UI suite passed: 564 files, 3,768 tests (`/tmp/ax-project-targets-full-ui.log`).
- Final build passed (`/tmp/ax-project-targets-build-final.log`). The expanded native journey passed against that build
  (`/tmp/ax-project-targets-visual-final-20261020.log`), now checking Projects Home heading/action bounds in addition to
  both editors, project isolation, picker destinations and unchanged definitions.
- Visually inspected the final `targets-800.png` under `/tmp/ax-project-targets-visual-final-20261020/`: Projects has its
  own line, toolbar actions wrap within the work area, and the previous overlap is gone. The automated bounds checks
  also passed at 600 CSS pixels and in light theme.
- Existing default native journeys passed all 10 checks (`/tmp/ax-project-targets-default-final-20261020.log`). The
  Needs You/Live default/minimal navigation journey also passed (`/tmp/ax-project-targets-portfolio-final-20261020.log`).
- Workspace lint and the unchanged 44-entry source-text ratchet passed (`/tmp/ax-project-targets-lint-final.log`,
  `/tmp/ax-project-targets-ratchet-final.log`); `git diff --check` passed.

An earlier default run reported zero pop-outs during singleton inventory while later goal checks opened/rendered the
board (`/tmp/ax-project-targets-default-regression-20261020.log`). That run overlapped preparation of the next build and
is not final qualification. No product cause was established; the fresh final run above passed without changing pop-out
code. Retain the earlier receipt as a harness-stability lead rather than silently treating every run as successful.

## Scope and further findings

This is fixture-backed GUI selection/visual verification, not six live scheduled runs or provider/MCP isolation.
The 600px viewport is a rendering stress case, not a native minimum-size promise. Very long duplicate-name paths still
consume substantial sidebar space. Projects Home cards still have their own title-only action names/path truncation;
they remain an inspection target, distinct from the repaired sidebar headers.

No model or scheduler execution was started by the native journey. Reviewer CLI invocations are recorded separately.
[DeepSeek/GLM/MiniMax attempts](../reviews/project-schedule-targets-2026-10-20/README.md) each ended in a terminal timeout
without substantive output; none counts as completed review or approval.
Unrelated runtime pins, release tests and the reference symlink are preserved. No push or release is included.
