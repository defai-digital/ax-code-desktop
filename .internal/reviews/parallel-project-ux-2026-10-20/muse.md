# Muse CLI source review

Advisory output. Claims require the independent validation in README.md. No visual or runtime verification.

muse: local session messaging disabled: session logging is required
muse: workspace root: /private/tmp (cwd default)
muse: Agent delegation: auto unavailable: workspace is untrusted.
## 1. Verdict — with limits

Not yet good enough for several concurrent projects plus scheduled bursts, based only on the excerpts. It is credible for a small, high-touch set: one shared supervision state, a bounded Needs You queue, Mission Control working sets, and a soft limit of four high-touch sessions.

This is source review only. No screenshots or live runtime were supplied, so there is no visual verification and no proof of overlapping execution, queue fairness, reconnect behaviour, or responsiveness under load.

## 2. High-impact problems

### 1. Competing triage surfaces and loss of return context — **source-confirmed**

Needs You answers permission/question requests inline through [NeedsYouQueue.tsx](/private/tmp/desktop/packages/ui/src/components/projects/NeedsYouQueue.tsx:106), while Mission Control opens the same class of request in a peek through [MissionControl.tsx](/private/tmp/desktop/packages/ui/src/components/supervision/MissionControl.tsx:137). Both are reasonable alone; together they risk the user losing queue position when opening a session.

Scenario: eight requests across four projects. The user opens item three, resolves it, and must rediscover where they were.

Improvement: make Needs You the canonical decision queue everywhere; Mission Control rows should deep-link to the same request item. Preserve source surface, selected item, scroll position and “item 3 of 8” return context.

Acceptance test: resolving requests from either surface removes exactly that request from both, restores the user to the next oldest item, and never reopens the resolved item.

### 2. Project/run identity and waiting reason are too thin — **source-confirmed**

[MissionControlRow.tsx](/private/tmp/desktop/packages/ui/src/components/supervision/missionControl/MissionControlRow.tsx:91) shows state, title, project, diff evidence and age, but not run/occurrence, schedule origin, worktree, host, or why work is waiting. [sessionState.ts](/private/tmp/desktop/packages/ui/src/lib/supervision/sessionState.ts:18) collapses `busy` and `retry` into `running`, and has no queued/waiting state. In Needs You, the project label is hidden below the `sm` breakpoint in [NeedsYouQueue.tsx](/private/tmp/desktop/packages/ui/src/components/projects/NeedsYouQueue.tsx:134).

Scenario: six scheduled occurrences start together; two have the same task title in one project, one waits for the same session, one waits for capacity. The board cannot explain which is which or why one has not started.

Improvement: show a compact identity line — project, task, run/occurrence, origin such as “Schedule: Nightly” — and a waiting-reason chip where Runtime supplies it, otherwise “Reason unavailable.” Keep multiple model lanes nested under their parent task with Compare; do not present lanes as separate projects or independent runs.

Acceptance test: in a six-occurrence burst, every occurrence is uniquely identifiable without opening it; waiting rows show their supplied reason; at 360 px wide, project, state and waiting reason remain visible.

### 3. Attention overload is hinted at, not managed — **source-confirmed**

[sessionState.ts](/private/tmp/desktop/packages/ui/src/lib/supervision/sessionState.ts:154) defines `HIGH_TOUCH_SOFT_LIMIT = 4` as “hints but never blocks.” [MissionControlHeader.tsx](/private/tmp/desktop/packages/ui/src/components/supervision/missionControl/MissionControlHeader.tsx:101) reduces the portfolio to needs-you and running counts plus an over-limit pill. Needs You can expand to the whole ranked list.

Scenario: twelve permissions, three errors and five running sessions across seven projects. A single count says there is pressure but not where attention buys the most progress, or which project is accumulating stale blockers.

Improvement: group Needs You by project with oldest-wait time, keep a strict top set visible, and summarise the remainder by project and reason. Working sets should pin projects or runs, not become a second manual triage system.

Acceptance test: with 15 blocked items in five projects, the user can identify the oldest blocker per project within two scans/clicks, and no project’s blockers disappear merely because another project is noisier.

### 4. Pause versus cancel semantics are not visible at run level — **hypothesis**

The provided Mission Control row exposes one state-dependent primary action, while the scheduled sidebar describes “inline run/pause” for scheduled tasks in [SidebarScheduledTasks.tsx](/private/tmp/desktop/packages/ui/src/components/session/sidebar/SidebarScheduledTasks.tsx:70). The excerpts do not show a run-level distinction between pausing future occurrences and cancelling the active occurrence.

Scenario: a nightly task is currently running and misbehaving. “Pause” may stop future nights only; the user believes the current run stopped and leaves it consuming resources.

Improvement: label actions explicitly — **Pause schedule** for future occurrences and **Cancel this run** for the active occurrence — scoped with project and run identity in the confirmation. Never widen this into automatic approval or broader autonomous activation.

Acceptance test: pausing leaves the current run visibly running and prevents only the next occurrence; cancelling stops only the named run and leaves other projects’ runs and approvals untouched.

### 5. Completion evidence is not yet an outcome recap — **hypothesis**

Mission Control evidence is diff-derived additions, deletions and files in [sessionState.ts](/private/tmp/desktop/packages/ui/src/lib/supervision/sessionState.ts:96). The excerpts do not show a portfolio recap consuming Runtime’s existing recap data, its freshness, verification outcome, or unresolved exceptions after completion.

Scenario: the user returns next morning after work in four projects. Recent rows show activity and diffs, but not which project succeeded, which failed verification, which recap is stale or unavailable, and what still needs review.

Improvement: add a per-project outcome recap using existing Runtime recap where available: result, verification status as reported, unresolved exceptions, evidence links, freshness or “recap unavailable,” and resume links. Completion alone must not be presented as verified success.

Acceptance test: after one success, one failure, one cancellation and one uncommitted result, the recap attributes each outcome to the correct project/run, preserves unavailable states, and opens the exact originating session.

## 3. Minimal information architecture

- **Projects Home:** portfolio outcome recap plus the canonical Needs You queue.
- **Mission Control:** live and recent execution board, grouped by project; task groups contain their model lanes and Compare.
- **Session view:** full conversation, inspector, evidence, recap and scoped run controls.
- **Sidebar Scheduled:** schedule definitions and next occurrences only; each occurrence links into Mission Control once admitted as a run.

One object chain throughout: Project → Task/Schedule → Run/Occurrence → Session → Request.

## 4. Tradeoff and what not to build

Tradeoff: denser identity and waiting context helps parallel supervision but competes with row scanability. Resolve it with a two-line compact row and inspector detail, rather than adding more columns.

Do not build a second runtime, a separate scheduled-task dashboard, automatic approvals, higher-spend concurrency controls, or a new autonomous control plane.
