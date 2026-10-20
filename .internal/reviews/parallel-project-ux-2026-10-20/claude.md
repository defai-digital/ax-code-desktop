# Claude CLI source review

Advisory output. Claims require the independent validation in README.md. No visual or runtime verification.

# AX Code Desktop: Parallel Multi-Project Supervision UX Review

## 1. Verdict

**Partially sufficient.** The existing surfaces handle interactive sessions that block on a person well:

- One urgency model is shared across surfaces.
- Request actions are scoped.
- Rows are labeled by project.
- Working sets, the pop-out, and the WIP soft limit help.

They are **not yet sufficient** for several projects running scheduled tasks at once. The PRD's own P0 #1, #5 and #7 call for queued, waiting, cancelled and recap states, and the shown code doesn't represent them.

**Limits of this review:**
- It is based only on the excerpts. Several files are truncated.
- I did not inspect the runtime, SDK, inspector, peek or session view.
- No screenshots were supplied, so nothing visual is verified.
- Problems marked "hypothesis" may already be handled outside these excerpts.

## 2. High-impact problems

### P1. The state model cannot express waiting or queued work (source-confirmed)

**Evidence:**
- `sessionState.ts:7`: `SupervisionState` is permission | question | error | goal | review | running | idle.
- `:21`: `"retry"` is folded into `running`.

There is no state for queued, waiting-for-idle, admission-delayed, cancelled or scheduled-pending. Everything that isn't busy and isn't flagged becomes `idle`.

**Scenario:** Three projects each have two tasks due at 09:00. Two are admitted; four wait behind session or worktree locks. Mission Control shows two running and hides the four waiting, because "Live" excludes `idle` (`:67`). A provider retry looks like progress.

**Improvement:**
- Add `queued`, `waiting` (with the reason the runtime supplies), `retrying`, `cancelled` and `unknown/disconnected`.
- Derive them only from runtime fields. Show the reason text verbatim in the row and the inspector.

**Acceptance test:** In the six-task burst fixture, all six occurrences appear in Live with distinct states and runtime-supplied reasons. A retrying session never renders as "running", and a disconnected host never renders as idle or success.

### P2. Run identity conflates parallel projects with model lanes in one task (source-confirmed in part, hypothesis in part)

**Evidence:**
- Rows are keyed by `sessionId` (`MissionControlRow.tsx:83`).
- Multi-run grouping comes from parsing titles (`:7`, `:44`).
- `summarizeWorkInProgress` counts every `running` row as high-touch (`sessionState.ts:72-73`, `:164`).
- The Needs You project label is hidden below `sm` (`NeedsYouQueue.tsx:135`).
- No row shows its scheduled origin or occurrence.

**Scenario:** One task fans out to three model lanes while a scheduled job runs in a second project. The header shows "over limit" (more than 4 high-touch), even though the user is supervising one decision. On a narrow window, two Needs You rows titled "Nightly deps check" can't be told apart.

**Improvement:**
- Show an identity line on every row: project · origin (interactive / schedule name + occurrence time) · lane count.
- Collapse lanes under their task.
- Count WIP per task, not per lane. Exclude unattended scheduled runs from "high-touch" unless they are blocked. Hypothesis: the runtime may need to expose the task/occurrence identity, which the SDK should supply rather than the UI parsing titles.

**Acceptance test:**
- At 360 px width, every Needs You and Mission Control row shows its project and origin.
- A 3-lane task plus 4 scheduled runs does not trigger the over-limit badge.
- Grouping works even when a title doesn't match the multi-run pattern.

### P3. Pause and cancel are not distinguished at the point of supervision (source-confirmed for the excerpts, hypothesis for the whole app)

**Evidence:**
- The sidebar offers "inline run/pause" for scheduled tasks (`SidebarScheduledTasks.tsx:72-73`).
- Mission Control's primary actions are review-request, answer, review-changes and open (`MissionControl.tsx:137-148`). There is no stop.
- PRD P0 #5 requires the distinction.

**Scenario:** A scheduled run in project A is misbehaving. The user clicks Pause in the sidebar, expecting it to stop. The current run continues, and only future occurrences stop.

**Improvement:**
- Offer two explicitly labeled controls: "Stop this run" (in the Mission Control inspector, scoped to the run) and "Pause schedule" (future occurrences only).
- Pausing while a run is active shows "Current run continues", and Stop is offered next to it. Both call runtime APIs; nothing is emulated client-side.

**Acceptance test:**
- Stopping run A1 leaves A2, project B's run and B's pending approval untouched.
- Pausing a schedule with an active run leaves that run running and the UI says so.

### P4. Opening from the pop-out displaces interactive context (hypothesis)

**Evidence:**
- The pop-out `openRow` calls `openSessionInMainWindow` (`MissionControl.tsx:119-121`).
- Review-changes in the pop-out skips the diff (`:132`).
- Compare is omitted (`MissionControlRow.tsx:24`).

**Scenario:** The user is typing a prompt in project C. In the pop-out, they double-click project A's failed run. If the main window navigates, their draft and scroll position in C are lost.

**Improvement:**
- Before switching away from an unsent draft or a running focused session, preserve it and offer "Return to C" (one keystroke).
- Alternatively, let the inspector show error, evidence and recap read-only without switching.

**Acceptance test:** With an unsent draft in C, opening A from the pop-out and then returning restores the draft, the scroll position and the selected session.

### P5. Results and recap are thin, and "review" is directory-attributed (source-confirmed for the excerpts)

**Evidence:**
- Rows show only diff counts and age (`MissionControlRow.tsx:115-118`).
- "Uncommitted" comes from per-directory git status (`NeedsYouQueue.tsx:50-56`).
- `idle` covers completed, cancelled and never-run alike.
- `lastRecap` exists per the PRD (`:26-28`) but is not consumed here.

**Scenario:** Two sessions share one working directory. Both show "review" for the same changes. The user returns after lunch and can't tell which of six runs succeeded.

**Improvement:**
- Show runtime `lastRecap` in the inspector and the Recent row, with freshness or an "unavailable" state.
- Separate completed, failed and cancelled.
- Attribute changes by worktree, and flag "shared directory" when attribution is ambiguous rather than duplicating it.

**Acceptance test:**
- After the success/failure/cancel/approval scenario, Recent shows four distinct outcomes, each with its recap or an "unavailable" label and a resume link.
- Shared-directory sessions don't both claim the same diff.

## 3. Minimal information architecture

- **One state vocabulary** (expanding P1), derived once and reused by all surfaces.
- **Needs You** (Projects Home) is a bounded projection of the same exceptions as Mission Control Live. It has the same order and the same count, and nothing else.
- **Mission Control** has two filters:
  - *Live*: blocked, then running/queued/waiting, grouped Project → Task/Occurrence → Lanes.
  - *Recent*: outcomes with recap.

  The inspector holds the waiting reason, evidence, recap, and Stop run / Pause schedule.
- **Sidebar Scheduled** holds schedule definitions and their next run. Its active-run state links into Mission Control rather than duplicating its controls.
- **Narrow layouts** keep the identity line and state; evidence and age move into the inspector.

## 4. Tradeoff and what not to build

**Tradeoff:** Grouping by project and task cuts noise, but it can bury a blocked lane inside a collapsed group. The resolution is that blocked items always surface flat and urgency-sorted above the groups, and grouping applies only to non-blocking work.

**Do not build:**
- A second runtime or a client-side queue or scheduler.
- Estimated ETAs or inferred states.
- Automatic approvals or "approve all".
- Concurrency or budget sliders, or any extra spend.
- Autonomous scheduling or activation.
- Another dashboard.
- Per-token notifications.
