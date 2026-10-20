# Parallel project UX advisory review

Requested by the user on 2026-10-20. Sources: the Desktop checkout at `e158c5e5`, its proposed parallel-outcomes
PRD and selected numbered UI excerpts. The supplied packet was 53,851 characters; hash and terminal receipts
are in [receipts.json](receipts.json). No screenshot was supplied to the reviewers.

| CLI | Invocation boundary | First-round result |
| --- | --- | --- |
| [Grok](grok.md) | Prompt file; tools empty; no subagents/web; one turn | Exit 0, 124.4 seconds |
| [Muse](muse.md) | Empty preset; no write/shell/web/reminders/user input; one model step; no session log | Exit 0, 33.7 seconds |
| [Claude](claude.md) | Print mode; tools empty; strict empty MCP config; no slash commands or session persistence | Exit 0, 52.8 seconds |

Each invocation ran from a temporary directory, with a 210-second deadline and stdout/stderr captured locally.
No source files were written by reviewers. Model selection used each installed CLI's default; no model identity
or runtime execution quality is inferred from the CLI name.

## Independent validation

- **Supported:** the supervision state projection lacks queued/waiting/unavailable states and folds retry into
  running. This does not mean the canonical runtime lacks a queue or that a tested burst lost a run.
- **Supported, narrower than reviewers claimed:** Needs You hides project labels under `sm` only for non-request
  rows. Permission/question cards have a separate context line. Mission Control container CSS keeps the project row.
- **Supported:** supervision rows carry session/project/directory identity and diff evidence, without scheduled
  occurrence/host fields. No `lastRecap` or `session.recap` usage was found under Desktop UI source during this review.
- **Corrected:** structured `metadata.multiRun` already takes precedence over title parsing in
  `lib/supervision/multiRunGroups.ts`. Adding metadata-first grouping again would duplicate existing behavior.
- **Hypotheses:** draft/scroll loss after navigation, duplicate decision submission, starvation and unclear stopping
  in the complete app require reproduction. Multiple entry points already share `RequestActionCard` and its decision
  store; their mere existence does not establish a bug.
- **Supported distinction:** Needs You ranking preserves source order within urgency tiers; Mission Control uses
  urgency and time. A shared ranking policy is a proposed improvement, not evidence of lost requests.
- **Not visual evidence:** the inspected prior `supervision-popout/screenshot.png` captures the main window with
  Settings open. It cannot qualify pop-out appearance or a populated multi-project layout.
- **Not accepted literally:** model text referring to `/private/tmp/desktop/...` links reflects the review working
  directory, not real source locations. Resolve citations from the repository root and verify code directly.

## Design synthesis

The review supports extending existing supervision rather than introducing another dashboard. The
[UX PRD](../../prd/PRD-2026-10-20-parallel-project-ux-v1.md) records seven problems with evidence classifications,
eight acceptance journeys and P0/P1/P2 priorities.

Do not enforce Grok's suggested single actionable location or coupled pop-out/main selection without testing:
multiple projections can safely share one decision identity/receipt, and automatic selection coupling could interrupt
work in another project. Preserve independent focus and explicit navigation; verify convergence and return context.
Global urgent exceptions and project grouping serve different tasks. Keep blockers discoverable across filters while
allowing non-blocking execution to be grouped. A high-touch hint is not a concurrency limit.

All three reviewers received a second bounded discussion prompt containing the independent corrections and each
other's design positions. The follow-up asks them to resolve action-location, selection and grouping tradeoffs.
All follow-ups reached exit 0: [Grok](grok-discussion.md), 47.8 seconds;
[Muse](muse-discussion.md), 10.4 seconds; [Claude](claude-discussion.md), 12.3 seconds.
They converged on multiple projections with one decision identity/receipt, independent window focus with explicit
navigation, global blocking-decision priority and project grouping for non-blocking execution.
The PRD's review decisions reflect this synthesis. Hypothesized context loss and starvation remain tests rather
than claimed defects. This round updates requirements; no implementation or parallel-runtime result is claimed.
