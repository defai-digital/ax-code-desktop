# Scheduled task UX review and workspace completion

Date: 2026-11-08. Branch: `feat/workspace-ux-2026`. Parent implementation: `728ccf06`.
Status: Implemented and qualified. The initial Workspace UX v1 verification gap is closed.

## Research and decisions

This is a source-backed heuristic review and fixture qualification, not a user study. Current primary references were
reviewed on 2026-11-08. Findings were checked against the pinned SDK and current Desktop source; the earlier
[scheduled-task architecture review](SCHEDULED-TASKS-2026-10-31-design-review.md) was navigation context, not authority
for changed runtime behavior.

| Reference | Relevant practice | AX Code decision |
| --- | --- | --- |
| [Linear recurring issues](https://linear.app/docs/creating-issues#recurring-issues) | Explicit cadence, first due date and owning team | Preserve project context and a visible recurrence description; do not introduce ambiguous natural-language scheduling |
| [Todoist recurring dates](https://www.todoist.com/help/todoist/features/introduction-to-recurring-dates-YUYVJJAV) | Calendar recurrence differs from recurrence after completion; editing an occurrence differs from changing a pattern | Confirm the pattern and timezone; retain calendar-based runtime semantics and existing family reconciliation |
| [Carbon empty states](https://www.carbondesignsystem.com/building-blocks/core/patterns/empty-states) | Contextual explanation and a usable next step; absent data differs from failed retrieval | Add loaded-empty guidance with a labeled create action; keep loading/error/retry distinct |
| [Cursor automations](https://cursor.com/docs/cloud-agent/automations) | Trigger, instructions, repository and activation are explicit; scheduled starts can be delayed | Put task intent before schedule/execution controls; avoid presenting a UI-computed execution promise |
| [Claude Code scheduling](https://code.claude.com/docs/en/scheduled-tasks) | Distinguish cloud, Desktop and session-scoped execution, including host availability | State that execution is local and the computer must be awake with AX Code running |
| [GitHub schedule events](https://docs.github.com/en/actions/reference/workflows-and-actions/events-that-trigger-workflows#schedule) | Timezone and missed/delayed execution semantics are explicit | Show timezone and existing missed-run policy; retain AX Code's own DST-gap refusal rather than copying GitHub's different DST adjustment |

## Experience review and implementation

The existing list already prioritizes running/failing work, distinguishes a missed one-time occurrence from completion,
retains history errors and offers recovery from partial creates. Those behaviors remain. The experience needed clearer
first-use guidance, stable timing while taking actions and an editor that starts with the user's intended work.

- The loaded-empty Scheduled section explains what to schedule and offers New scheduled task. With several projects,
  creation still requires the existing project choice. Failed and pending project reads never become an empty success.
- Next-run/stopped/running information is part of each task's content instead of being replaced by hover actions.
  More actions is always discoverable; quick Run now and Pause/Resume retain keyboard/hover access and state eligibility.
  Recurrence retains its timezone even when it matches the viewer's local timezone. Project context uses the same
  distinguishing path suffix as the rest of the sidebar, retaining full hover/accessibility identity.
- The editor now orders task name and prompt before recurrence and execution settings. The summary confirms normalized
  times, weekdays/date, selected timezone, automatic-run state, local host availability and existing catch-up/skip behavior.
  It describes configured intent rather than predicting runtime next-run math. Runtime readback remains authoritative.
- An untouched imported cron/irregular family describes its canonical schedule, not the daily fallback used by the editor.
  A prompt-only save retains the original schedule; an explicit schedule edit updates the confirmation.
- All user-facing copy follows the existing 14-locale catalogs. Theme and typography primitives, runtime/SDK pins,
  canonical paths, permissions, budgets and execution ownership are unchanged.

A new scheduler/dashboard or calendar would add navigation and imply capabilities without solving these verified
problems. No cloud execution, free-text recurrence parser, new runtime state machine or producer-owned run metadata is
introduced. The current typed run history has no validated session destination; a future result-link design needs a
canonical producer relation rather than a guessed match by title. These remain architecture/product considerations,
not incomplete implementations of the requirements in this change.

## Sidebar failure and repair

The old responsive handler read current panel state when each 100ms debounce fired and reapplied collapse defaults
on every resize, including a notification with unchanged dimensions. A native trace showed Open sessions expanding the
sidebar, followed roughly 100ms later by automatic closure at the same 600px width. Three behavior regressions failed
against the extracted original handler: repeated same-width notification, newer close/reopen during pending resize and
height-only resize after reopening.

`useResponsivePanels` now tracks the last applied dimensions and per-panel visibility revisions. Only a changed axis
can apply responsive defaults; a timer cannot overwrite a newer explicit visibility choice. Automatic collapse still
restores at the original hysteresis thresholds. Manual changes cancel automatic restoration; touch keyboard resizes
and cleanup retain their contracts. No second click or test retry is used to compensate for the original failure.

## Additional verification repairs

- A successful empty cache followed by a startup-time refresh refusal previously still qualified for first-use copy
  while the brief startup error grace hid the refusal. A reproduced failing test now covers both the pending refresh
  and rejected refresh; an empty cached list remains loading until retrieval succeeds or the grace exposes Retry.
- The default native harness awaited two compositor frames without a bound. It now observes the Settings popup's
  open/ending state after each keyboard Open, then closes it with Escape. A unit regression rejects compositor-based
  readiness. Its supervision journey closes the pop-out it created and the keyboard journey explicitly focuses the
  native main window; diagnosis showed no key events when the still-open pop-out reclaimed focus after reload.
- Needs You inspection previously selected any dialog, so retained Settings content could be read as the result.
  The harness selects the named Needs You dialog and waits for the requested main-window goal revision. A regression
  keeps a separate Settings dialog present to prove target identity. These are fixture repairs, not product shortcuts
  that resend an action after failure.
- Diff content is visibility-gated and occasionally stayed as a skeleton during metric emulation despite a visible
  container. Native focus alone did not resolve every run. The workspace fixture now reads a presented screenshot
  while polling the populated diff DOM, then retains the populated screenshot. This is consistent with native
  compositor/visibility scheduling; it does not establish a production diff-data failure or qualify occlusion/animation
  timing. No file-selection retry, injected diff content or weakened populated-content condition is used.
- A full Web suite run exposed an unrelated deadline-test race: its shell-written PID file was absent when the child
  was killed under load. The test now observes the actual spawned ChildProcess, uses exec to avoid a descendant sleep,
  requires the real kill and SIGTERM outcome, asserts that the PID is dead, and always cleans up. The production
  notification timeout is unchanged; neither the deadline nor the test's timeout is widened.
- The scheduling runtime stand-in lacked Pause/Resume persistence. Its fixture-only routes now record the exact status
  update and reject foreign project scope. Native checks assert independent readback after each operation.

## Verification and completion audit

All six final root gates passed: `check:boundaries`, `check:locales`, `typecheck`, `lint`, `test` and `build`.
The complete final suite passed 9,025 tests with 12 existing skipped cases; UI passed all 5,481 tests. Catalog validation
covered 14 locales, 5,450 keys and 70,850 translated entries. Final logs use the `complete-` prefix in the receipt root.
The final shell (8 mapped code assets) and renderer (158 mapped assets) are byte-identical to native qualification.
The retained manifest records Git blob identities for 32 changed executable/configuration/test sources.
Native receipt root: `/var/folders/pw/j64s76pj6sl3t1ty5bg9ctq00000gp/T/ax-ux-v2-final-7mvjt5iw`. All 13 final native groups passed, including three consecutive identity runs
and two consecutive populated workspace runs. Historical failing diagnostics are retained separately in the receipt
manifest; their harness/readiness repairs are described above.

| Requirement | Implementation evidence | Behavioral/native evidence |
| --- | --- | --- |
| Workspace v1.1: sidebar/inspector handoff and reduced motion | openBesideChat, MainLayout suspension, Sidebar/RightSidebar CSS | Handoff/guard regressions and native workspace light/dark journey |
| Workspace v1.2: narrow/focused inspection and retained drafts | SplitPaneLayout stable wrapper, selector, focus/return | Mounted DOM/focus tests and native unsent-composer identity check |
| Workspace v1.3: navigation hierarchy | WorkspaceNavigation and existing Mission Control | Navigation guard/view tests and native Portfolio/grid selection |
| Workspace v1.4: projects before bounded starters | ChatContainer and DraftPresetChips | Disclosure tests and native first-viewport/order assertion |
| Workspace v1.5: project identity | ProjectIdentityText and compactProjectContext | Collision/full-action tests and repeated native same-name identity navigation |
| Workspace v1.6: retry projection | SupervisionStateBadge and useSupervisionRows | Root retry, child attribution and blocking-decision precedence tests |
| Scheduled v2.1: trustworthy loaded-empty state | SidebarScheduledTasks | Empty/loading/error/search tests; native scoped create entry |
| Scheduled v2.2: stable timing and discoverable actions | Scheduled row content and More trigger | Timing/zone tests; native menu-open geometry and persisted pause/resume |
| Scheduled v2.3: task intent and schedule confirmation | Editor field order and ScheduledTaskConfirmation | Confirmation tests; native order, summary updates, save/reopen and narrow screenshot |
| Scheduled v2.4: host/missed-run explanation | Confirmation copy and original catchUpPolicy | Catch-up/skip/off tests and populated native summary |
| Scheduled v2.5: existing editing/recovery contracts | Existing families, validation and recovery handlers retained | Native history/retry, DST refusal/correction, partial create/lost acknowledgement, cron preservation |
| Responsive regression | useResponsivePanels | Deterministic regressions plus repeated native identity runs without retrying Open sessions |

The completion audit covers every requirement above. Exact SDK/runtime/dependency pins and ownership boundaries are
unchanged; repository artifacts and commit text use English. Source identities are checked against the containing commit,
and delivery verifies origin/HEAD convergence plus a clean implementation worktree. No merge or release is included.

## Evidence scope

Native fixtures run the actual macOS Electron development renderer through native WebMCP with disposable repositories
and an isolated runtime stand-in. Persisted fixture readback verifies UI actions independently. They do not certify
live-provider execution, runtime throughput, a signed release or measured user productivity. Narrow stress captures do
not change the native minimum window-size promise. Selected screenshots and the completed verification manifest are retained below.

## Retained review artifacts

- [Schedule summary in a narrow light window](workspace-ux-20261108/schedule-summary-light.png)
- [Task-first editor in dark theme](workspace-ux-20261108/schedule-editor-dark.png)
- [Focused populated review](workspace-ux-20261108/review-focused-dark.png)
- [Projects before starter suggestions](workspace-ux-20261108/workspace-home-dark.png)
- [Same-name identity after reopening and repeated resize](workspace-ux-20261108/sidebar-identity-light.png)
- [Verification manifest and source identities](workspace-ux-20261108/verification.json)
