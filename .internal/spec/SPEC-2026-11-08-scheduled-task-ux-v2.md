# Scheduled task UX v2 technical contract

Status: Authorized implementation specification for PRD-2026-11-08-scheduled-task-ux-v2.

- Reuse ScheduledTaskDraft, existing family reconciliation, pending order and project action handlers. No additional store, runtime API, scheduler or dependency.
- Render a first-use state only when every requested project loaded successfully and the combined task list is empty. The create action uses the existing project selection control.
- Keep timing inside the task identity area rather than the hover action slot. More actions stays visible; Run now and Pause/Resume retain existing eligibility and busy rules.
- Summaries describe draft recurrence and IANA timezone using existing translated schedule formatters. Untouched irregular/cron families retain their canonical source description until the schedule changes. One-time summaries display the draft wall time and zone without implying a confirmed runtime instant.
- Draft status and missed-run guidance must not mislabel a finished task as scheduled or change the existing catchUpPolicy.
- Keep the composer, Files guard, scheduler ownership and canonical project paths unchanged. Native actions require fresh DOM and persisted readback, not action acknowledgements.
