# Hooks positioning and diagnostic access v1

Status: Navigation arrangement authorized on 2026-10-20 by the user's "hooks arrangement, agree. do it" instruction.
HV-01 to HV-05 apply to the bounded read-only arrangement. HV-06/07 remain proposed validation work, not claims of
completed concurrency qualification or established adoption. User requested value review and discussion with other LLMs.
Evidence: [recommendation and source review](../reports/PRODUCT-2026-10-20-hooks-value.md),
[six-model discussion and independent disposition](../reviews/hooks-value-2026-10-20/README.md).
This does not amend accepted ownership, authorization or runtime contracts.

## Product decision proposed

Retain optional runtime Hooks and Desktop diagnostic visibility. Reduce the standalone configuration page's prominence
through the existing per-project Advanced/Diagnostics information architecture, with Settings search and contextual
entrypoints. Prioritize recap, concurrent schedules and verified application outcomes over new hook authoring features.
No navigation move or removal is implemented by this proposal.

## Requirements

| ID | Requirement and acceptance |
| --- | --- |
| HV-01 | Preserve config-only runtime users and existing activity/contracts. Moving Desktop navigation cannot enable, disable, edit or execute a hook. |
| HV-02 | Users can identify the exact project, effective command/source, trust and configuration validity from the inspection path. Same-name targets remain distinct and keyboard-accessible. |
| HV-03 | Users with ignored/invalid configuration or a blocked/failed hook can reach diagnostics even if no hook is currently active. Validate Settings search and contextual navigation with real task scenarios. |
| HV-04 | Describe reminders, warnings, blockable checks and verified outcomes accurately. Neither pack names nor zero exit establish tests passed or an application requirement was satisfied. |
| HV-05 | Reuse the existing hook activity store/projections. New historical, recap or queue fields require canonical producer contracts; do not infer durable history from bounded client activity. |
| HV-06 | Qualify fast/failing/slow hook effects on six scheduled tasks in three projects, including queue contention and timeout/cancellation. Keep fixture, local source and signed-runtime/live-provider evidence distinct. |
| HV-07 | Assess diagnostic task success, integration benefit and support/latency cost before choosing removal or investment thresholds. Model votes, arbitrary adoption percentages and page views alone cannot establish value. |

## Plan and implementation gate

1. Complete and record the currently authorized Settings targeting and Hooks expansion repairs.
2. Map the existing project settings/navigation, Settings search and hook activity entrypoints; propose the smallest
   coherent placement without creating another project registry or generic dashboard. Record navigation acceptance
   tasks and screenshots before changing production navigation.
3. Implement only the agreed placement/diagnostic scope under existing contracts. New write/activation behavior follows
   runtime ADR-211's separate trust decision, paired ADR/spec work and explicit authorization.
4. Run user diagnosis tasks and the bounded concurrency matrix, compare the baseline and record results. Revisit the
   proposed placement if users cannot find diagnostics. Treat removal as a separate evidence-backed migration decision.

No hook builder, automatic activation, recurring model work, new telemetry service, enterprise policy substitute or
runtime feature removal is authorized or necessary for this proposal.
