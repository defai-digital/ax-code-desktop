# Hooks value: retain the runtime extension, simplify its Desktop prominence

Date: 2026-10-20. Recommendation, not an accepted navigation/feature-removal decision.
Inputs: [six-model advisory discussion](../reviews/hooks-value-2026-10-20/README.md), local source and official docs.

## Recommendation

Keep lifecycle Hooks in AX Code as an advanced, optional project integration mechanism. Keep Desktop inspection and
existing contextual hook activity, but propose moving configuration discovery under per-project Advanced/Diagnostics.
Retain Settings search and contextual links for ignored/invalid configuration and hook failures; an inactive hook can
still require diagnosis. Do not prioritize a visual hook builder, marketplace, new scheduler or automatic activation.
Complete current correctness repairs before making a navigation change.

Hooks have plausible high value for a narrower group integrating project-specific deterministic checks. They have not
established broad-user value or earned priority over readable recap, trustworthy schedules and project supervision.
The page's job is explaining effective configuration; its existence is not evidence that hooks improve outcomes.

## Verified behavior and limits

Desktop baseline `7723a594` has a read-only Hooks page and an existing `hook.completed` consumer, activity store and
`HookActivityRows` presentation. Reuse those paths before proposing another history or notification surface.
The pending UI repair improves same-name project choices, independent command expansion and selection dismissal.

AX Code source inspected at `cc0f084bfc537d4cce9ffb33a7f698b28be2dea6` (the following paths were clean):

- `packages/ax-code/src/hooks/lifecycle.ts`: trusted project shell hooks, blockable versus observation-only events,
  bounded feedback, timeout and a four-process concurrency limit per runtime process.
- `docs/guides/hooks.md`: project opt-in and event/protocol semantics.
- `packages/ax-code/src/session/prompt/prompt-loop-result.ts`: Stop awaits hook execution without consuming its return.
- Accepted runtime ADR-211 permits read-only configuration/activity and explicitly defers write APIs and their trust flow.

The built-in format-after-edit and require-tests-on-stop commands print reminders. protect-env-files warns; it does not
block. block-force-push attempts to block supported command forms, but it is not a universal shell security boundary.
These observations describe the inspected source, not a new qualification of the installed signed runtime.

[Claude's official guide](https://code.claude.com/docs/en/hooks-guide) illustrates formatting, notifications and command
validation through lifecycle hooks. [GitHub's official overview](https://docs.github.com/en/copilot/concepts/agents/hooks)
also describes event-bound scripts and tool admission. These establish concrete workflow patterns, not AX adoption or
equivalent contracts. AX permissions, AX Trust policy and runtime verification keep their canonical responsibilities.

## Where to invest

| User job | Retain or improve | Avoid implying |
| --- | --- | --- |
| Apply a team's custom check at a known tool boundary | Existing runtime extension; independently test admitted/blocked outcomes for a specific script | Complete policy enforcement or protection against every shell form |
| Understand why work was blocked, asked for approval or failed | Existing contextual activity and a route to the correct project's effective configuration | A fresh duplicated event store or automatic approval |
| Explain why a configured hook did not run | Trust/validity/source diagnostics; preserve access even when no hooks are active | Automatic trust based on a repository file or silent enablement |
| Verify a web change | Runtime acceptance checks and WebMCP observations; hooks may invoke an explicitly configured check | A reminder, zero exit or successful hook equals application acceptance |
| Supervise scheduled parallel work | Measure hook queue/timeout impact alongside canonical run state | Hooks are a durable scheduler or provide exactly-once external effects |

## Evidence needed before hiding or removing

Use opt-in task observation and bounded existing diagnostics first, not a new telemetry product. Recruit teams with
real custom checks and users who do not use hooks. Compare diagnosis and successful completion with the current versus
proposed location. Record whether users find the right project, explain ignored/blocked behavior and recover; also record
maintenance/support effort. Define success criteria before observing results, using a measured baseline.

For six scheduled tasks across three projects, compare hooks off, a fast check, a failing check and a slow check. Observe
hook queue time, per-project task delay, timeout/cancellation effects and independent final acceptance. A four-slot hook
limit is not a four-task product capacity claim. Do not raise concurrency merely to make a test pass.

Low page visits alone do not justify removing a rare diagnostic or a used config-only integration. Consider page removal
only after contextual/advanced access demonstrably covers diagnosis and affected users can recover. Consider runtime
removal only after establishing migration, compatibility cost and replacement of valuable jobs. No evidence currently
supports that decision. The next product work is the [proposed PRD](../prd/PRD-2026-10-20-hooks-positioning-v1.md).
