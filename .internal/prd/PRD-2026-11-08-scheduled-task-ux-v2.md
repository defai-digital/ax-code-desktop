# Scheduled task UX v2

Status: Authorized by the user's 2026-11-08 request to research and improve scheduled-task UX while completing Workspace UX v1.
Extends PRD-2026-10-20-scheduled-outcomes-v1. Execution remains owned by the pinned runtime.

## Research and current evidence

Reviewed on 2026-11-08:

- [Linear recurring issues](https://linear.app/docs/creating-issues#recurring-issues): recurrence has an explicit cadence and first due date; the originating team context remains clear.
- [Todoist recurring dates](https://www.todoist.com/help/todoist/features/introduction-to-recurring-dates-YUYVJJAV): distinguishes calendar-based recurrence from completion-based recurrence and individual rescheduling from pattern edits.
- [Cursor automations](https://cursor.com/docs/cloud-agent/automations): explicit trigger, instructions and activation; scheduled starts may be delayed.
- [Claude Code scheduling](https://code.claude.com/docs/en/scheduled-tasks): makes execution host, machine availability and persistence differences explicit.
- [Carbon empty states](https://www.carbondesignsystem.com/building-blocks/core/patterns/empty-states): contextual explanation and an actionable next step; loading and failed retrieval are distinct from empty data.
- [GitHub schedule events](https://docs.github.com/en/actions/reference/workflows-and-actions/events-that-trigger-workflows#schedule): timezone and missed/late execution semantics need explicit documentation. Its DST behavior differs from AX Code; do not copy execution semantics.

Source review found a blank loaded Scheduled section, hover actions replacing next-run information, recurrence timezone omitted when local, and a long editor with the prompt after model and scheduling controls. Existing history, partial-create recovery, DST validation, completed/missed state distinction and project scoping are strengths to retain.

## Requirements

1. A successfully loaded empty list explains the feature and provides a labeled project-scoped create action. Loading, failures, collapsed lists and session-search suppression must not claim emptiness.
2. Each row keeps its runtime-derived next-run or stopped/running state visible while controls are used. Keep distinct outcomes and errors; make More actions discoverable without hover. Show recurrence timezone and preserve full accessible project identity.
3. The editor follows task intent, schedule, then execution settings. Keep the prompt and name together. Provide a readable schedule confirmation with timezone and an explicit paused notice before saving; do not invent runtime next-run predictions.
4. Explain local execution: this computer must be awake with AX Code running at the scheduled time. Explain the existing missed-run policy in the editor, including run-once versus skip, using the runtime contract. No new schedule kind, cloud execution, budget, approval or runtime state is introduced.
5. Retain daily/weekly/multiple-time/once editing, unchanged irregular schedules, native keyboard access, light/dark support, DST validation and recovery from uncertain creates.

## Acceptance

Behavioral tests prove empty/loading/error distinction, project-scoped creation, stable row timing and timezone, and schedule confirmation including paused and irregular drafts. Native WebMCP proves actual field order, summary updates, daily/weekly/once editing, saved/reopened values, history/error recovery, and narrow/wide light/dark rendering. Full root gates and repeated native sidebar regression must pass before final commit and push.
