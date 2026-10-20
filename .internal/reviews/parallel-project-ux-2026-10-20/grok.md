# Grok CLI source review

Advisory output. Claims require the independent validation in README.md. No visual or runtime verification.

The existing supervision skeleton is good enough to watch a few sessions. It is not good enough to leave several projects and scheduled tasks running and return to an accurate, attributable picture. Desktop already has Projects Home, Needs You, Mission Control (embedded and pop-out, live/recent, working sets, density, peek, scoped request actions), and the sidebar Scheduled list. The gap is how those surfaces share identity, waiting reasons, and outcomes. This review uses only the supplied excerpts. No screenshots, runtime traces, or qualification runs were used. Header, sidebar, and Mission Control files are truncated, so column collapse beyond the cited `sm` rule is unverified.

## Problems

**1. Competing surfaces split one decision — source-confirmed**

Needs You answers a permission or question inline (`RequestActionCard`) and opens the session for every other reason. Mission Control’s primary action for `review-request` and `answer` only opens the peek. The pop-out then sends that session to the main window and omits compare, dispatch, and beside-chat diff. Sidebar Scheduled separately offers inline run/pause for the same projects. Live/recent and working sets are one control group: choosing a set unpresses Live.

Scenario: a scheduled run in project B is blocked on a permission while you are in project A. Home offers an inline answer, the pop-out board opens B in the main window, and the sidebar still shows run/pause. After the detour, A is gone and the board may be filtered to a working set that hides Live.

Improvement: one exception object (project, session, reason) with a single answer or open action. Home, the board, and the sidebar deep-link to it. Pop-out and main window share the same selected session. A working set filters rows and must not clear the Live exception count.

Acceptance: one pending permission is actionable in exactly one place; the other two surfaces show the same project, title, and reason and update within one refresh when it is resolved. Pop-out focus and main-window focus stay the same session. Selecting a working set still shows the unfiltered needs-you count.

**2. Waiting looks like running, and several outcomes look like idle — source-confirmed**

`deriveSupervisionState` returns permission, question, running (`busy` or `retry`), error, goal, review (uncommitted), or idle. Running outranks an unseen error. Tree precedence keeps a running parent ahead of a child error or uncommitted work. Diff counts are the only evidence. The excerpts show no queued, waiting-for-idle, cancelled, or unavailable state, and no runtime wait reason.

Scenario: project A is busy, so a scheduled task waits for that session; project B is queued behind a limit; a child run has failed. The board can show A as running and B as running or idle, with retry indistinguishable from work.

Improvement: keep this derivation, and add a runtime-supplied wait class on the existing row: queued, waiting on session, retrying, running, blocked, failed, cancelled, completed, unavailable. If the runtime sends no reason, show “reason unavailable.” Do not infer success.

Acceptance: a fixture with one busy session, one waiting-for-idle occurrence, and one queued project shows three different labels plus the runtime reason string. A null reason renders unavailable. A child failure stays visible while the parent runs.

**3. Project and run identity disappear, and multi-run lanes look like another project — source-confirmed**

Needs You puts the project in a label with `hidden … sm:inline`. The board row shows title, project, diff evidence, and age, but no run, occurrence, worktree, or host. Compare comes from `parseMultiRunSessionTitle` and is a same-task multi-run action; the pop-out drops it. That is multiple model lanes in one task, not multi-project execution.

Scenario: two projects have sessions with the same title. On a narrow window, Needs You shows the title and “Permission” without the project. Compare on a wide board looks like a second project.

Improvement: always show the project in the visible label and accessible name, with the full label in a tooltip. Name Compare as lanes of this task. When the runtime supplies a scheduled occurrence, show the task name and occurrence on that row.

Acceptance: below the `sm` breakpoint, both same-title permission rows still show different project names before any approve control. The Compare accessible name includes “same task.” A scheduled row’s accessible name includes project and task.

**4. Pause and cancel are easy to confuse — source-confirmed placement; cancel scope is a hypothesis**

Sidebar Scheduled documents inline run/pause, with edit and delete in a menu, ordered as running, failing, next run, then paused. Mission Control’s row actions are compare, the state primary (peek, review changes, or open), and remove-from-set. These excerpts do not show a control that cancels only the current occurrence. A session-level cancel may exist outside them.

Scenario: six scheduled tasks become due. You press Pause on a running row in project A, expecting that run to stop, and either leave it running or stop future work you meant to keep. You cannot see that project B’s approval was left alone.

Improvement: on a scheduled row, use two labels when both apply: “Pause schedule” (future occurrences) and “Cancel this run” (this occurrence only). Confirm with project, task, and which operation. Wire both to the existing runtime. Do not put either control on a permission card.

Acceptance: pause leaves the in-flight run running and listed as running; cancel ends that run, keeps the schedule, and leaves another project’s pending approval in place. The confirm names the project and the operation.

**5. Returning users get diffs, not a recap — source-confirmed for these components**

Rows show `EvidenceText` (additions, deletions, files) and a goal line. Idle work leaves Live. Recent is a mode, not a result. None of the supplied components render `session.recap` or `lastRecap`. A durable preview and a portfolio recap are different, and the producer should be reused.

Scenario: you work in project A while B and C finish. Live no longer contains them. Recent shows titles and diff counts, so you cannot tell a verified result from an unfinished edit or a missing recap.

Improvement: consume the existing recap in the peek and in Home’s project activity: outcome, freshness, and a resume link. Needs You remains exceptions only. Missing or stale recap stays explicit.

Acceptance: a completed session with `lastRecap` shows that text and timestamp in the peek and on Home. A missing recap shows unavailable. An unresolved error in another project remains on Needs You.

## Information architecture

Keep the current surfaces and give each one job.

- **Projects Home:** per-project activity, last recap or unavailable, and exception count. Needs You is the bounded exception inbox.
- **Mission Control:** the live board, embedded or popped out. Row identity is project, session or task, and run when supplied. Live means running or blocked, with a reason. Recent means completed work with recap. Working sets only filter. The peek is the inspector.
- **Sidebar Scheduled:** next run, pause schedule, run now, and load failures. An in-flight run links to its board row.

Multi-project work is separate rows with isolated controls. Multi-run Compare stays a same-task lanes action. The high-touch soft limit of 4 remains a hint and never blocks.

## Tradeoff

Do not merge Home, Mission Control, and Scheduled into one board. Separate jobs keep attention bounded; the cost is three entry points, paid for with shared identity and one actionable exception.

Do not build a second scheduler or recap producer, consumer-only endpoints, automatic approvals, higher concurrency, extra spend, or broader autonomous activation. Do not treat opening many projects, or a spinner count, as evidence of parallel execution.
