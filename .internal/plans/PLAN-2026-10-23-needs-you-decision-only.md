# PLAN-2026-10-23: Needs you means a decision

Status: implemented in the commit that adds this file.

## Problem

"Needs you" pulled a person into sessions that held no decision. One definition (`needsYouReason`) fed the titlebar
pill, both queues, the project tone, the switcher order and the next-needs-you walk, and it counted five reasons:
permission, question, error, goal and uncommitted. Only the first two, and a blocked goal, stop the runtime until a
person acts. The other two were state, not decisions, and both could never clear on their own:

- `error` is the unseen-error flag. It clears only when the user views the session, so a session that recovered kept it.
- `uncommitted` was `runEndedAt` set and the directory git status dirty. It had no proof the session changed anything
  (the user's own edits or a sibling session made every ended session in that directory a row), it ignored the
  dismissal the in-session nudge already stores (`nudgeDismissedAt`), and `runEndedAt` outlives a clean tree.

## Review (2026-10-23)

codex (read-only) and grok independently reached the same verdict: keep the inbox, narrow its definition. Both
cited the same defects, and that the surfaces disagreed (`needsYouReason` ignored running, `deriveSupervisionState`
did not).

Pros kept: one cross-project place to answer blocked requests, urgency order, inline Allow/Deny.
Cons removed: amber count that included non-decisions, stale entries that never clear, project cards saying
"needs you" while an agent ran, no dismissal, two definitions of the same state.

## Decision

- **Needs you** = the runtime is stopped and only a person can continue it: permission, question, and a goal that
  cannot progress while the session is not running. Only these count in the titlebar, light the project tone, float
  sessions in the switcher, feed the palette and the next-needs-you walk.
- **Follow up** = worth a look, no decision pending: an unseen failure while the session is not running, and finished
  work. Listed quietly on the Projects home (`FollowUpList`), neutral colour, one row per session, dismissible.
  A session that holds a decision is listed only as a decision.
- Finished work needs evidence of the session's own changes (the runtime session summary reports files or lines)
  on top of a dirty directory, and honours `nudgeDismissedAt >= runEndedAt` like the in-session nudge.
- A goal decision outranks an error in row order and tree precedence.
- The titlebar popover lists only decisions (requests plus goals). The sidebar Live section holds decisions and working
  sessions, so follow-ups cannot crowd working sessions out. Mission Control keeps every state, including follow-ups.
- Dismissing a follow-up clears both the failure and the finished-work flag, so one click removes the row.
- A codex review of the diff found these three surfaces (popover, dismissal, sidebar Live); all are fixed above.

## Follow-up round (same day)

- An unseen error is superseded by a later run: the renderer records when a run began (`run-start-tracker`), and when
  that run goes idle it marks the session's error notifications older than the start as viewed. An error raised inside
  the run that just ended stays, and a run not observed from its start never clears anything.
- Past `HIGH_TOUCH_SOFT_LIMIT` waiting requests, new permission and question toasts are replaced by one summary toast
  whose count follows the queue, and whose action opens the Needs you list. It is removed when the queue drops back.

## Not done (open)

- Snapshotting the directory's changed files at run start, to attribute changes exactly when siblings share a worktree.
- The tray menu and the dock badge already count only requests; their two writers should share one count.

## Verification

Unit tests for the split (`needsYou.test.ts`, `sessionState.test.ts`, `missionGroups.test.ts`), the input
derivation with mutation probes (`useNeedsYouSessions.test.tsx`) and the new list (`FollowUpList.test.tsx`).
