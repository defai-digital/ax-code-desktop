# Reference-informed supervision and verified outcomes v1

Status: Proposed. Requested on 2026-10-20. This extends the WebMCP/recap, scheduled-outcomes and parallel-project UX
proposals; it does not silently rewrite or supersede accepted PRDs, ADRs or specs.

Evidence: [four-reference comparison](../reports/DESIGN-2026-10-20-reference-comparison.md).
Execution: [implementation plan](../plans/PLAN-2026-10-20-reference-informed-supervision-v1.md).

## Product objective

Help a user supervise several coding projects, return to understandable results, and verify that a web application
actually meets the requested behavior. WebMCP should reduce the distance between a coding claim and an observed result.

The existing Projects Home, Needs You, Mission Control, session workspace and project browser form the information
architecture. Each keeps its role: portfolio orientation, actionable decisions, execution supervision, detailed work and
application verification. Additional dashboards are not the default response to missing joins or unclear states.

## Requirements

| ID | Priority | Requirement and observable acceptance |
| --- | --- | --- |
| RS-01 | P0 | Keep project/task identity visible in compact exception and result rows, with path/worktree disambiguation for duplicate names. Accessible action names carry the same context. Test supported native widths, 800/1280 CSS pixels, component checks at 360, and 200% zoom. |
| RS-02 | P0 | Separate execution state, verification, unread state and user acceptance. Idle, a green check, a recap, or a viewed result cannot alone mean verified success. Display unavailable/stale data explicitly. |
| RS-03 | P0 | Prioritize blocking decisions, then actionable unread results, with ongoing execution still discoverable. Retain the existing canonical decision identity and receipt store; resolving from one surface updates the others without redirecting their selection. |
| RS-04 | P0 | Preserve project/worktree destination, unsent drafts and focused controls through inventory refreshes and temporary navigation. Do not fall back to another execution directory while the intended one is loading or unavailable. Explain an unavailable target before submission. |
| RS-05 | P1 | Show an available canonical session recap immediately when returning. Include project/session, generation time and scope. Reading it must not require a provider call. Expose an accessible full-text path when a compact preview is truncated. |
| RS-06 | P1 | Distinguish no recap, loading, ready, possibly outdated, generation failure and unavailable provider. Derive freshness only from fields whose producer semantics are known. A late response cannot populate another project's recap. Refresh is explicit and uses existing runtime budgets/permissions. |
| RS-07 | P0 | Identify each admitted schedule occurrence independently of its definition and eventual session. Show producer-reported queued/waiting/running/terminal state, error, timing and result link. Keep scheduled failures and unread outcomes discoverable across projects. Pause schedule and cancel run have distinct effects. |
| RS-08 | P0 | Detect the system IANA timezone once at renderer startup and use the cached value for new schedule drafts, as already implemented. Persist the selected zone, preserve existing schedules and user overrides, and label next-run previews with their zone. Device travel does not rewrite saved recurrence. |
| RS-09 | P1 | Convert a WebMCP failure into a reproducible journey containing intent, project/app/build identity, prerequisites, fresh target resolution, expected/observed results and evidence. Repeat it after repair. A tool acknowledgement alone cannot pass the journey. |
| RS-10 | P1 | Keep settings labels, scope, inherited/default values, dirty state, reset actions and errors consistent. Search/filter controls need useful empty/reset states. Validate nested controls and narrow containers, not only navigation tabs. |
| RS-11 | P1 | Coordinate notifications across the main window and pop-out: one decision identity, bounded interruption frequency, no repeated sound for the same observed event under qualified conditions. Explicitly test reconnect and unavailable coordination storage. |
| RS-12 | P1 | State what closing a view, closing Desktop, stopping a runtime and restarting a machine actually do to schedules/runs. Populate a verified lifecycle matrix; do not promise process survival from layout/session restoration. |

## Recap delivery in two increments

**First increment: canonical saved display hint.** The installed SDK already exposes `lastRecap.text`, `.time` and
`.scope`, plus `session.recap`. Use this contract to solve discoverability and return orientation. Inspect runtime ADR-148
and related recap semantics before fixing freshness or generation behavior in a spec. The existing hint has no structured
verification references or revision binding. Show that limitation; never extract a verified badge by parsing its prose.
If freshness cannot be proven, retain timestamped history with an explicit qualification instead of claiming it is current.
Until those semantics are established, present it as a saved, unverified summary with time/scope, without a current or
verified badge. The absence of structured evidence must remain visible when the user opens the result details.

**Second increment: outcome evidence.** Link tests, observed workflows, diffs/commits and unresolved work using canonical
producer facts. This may require AX Code and generated SDK changes plus paired ADR/spec records. Desktop owns presentation
and navigation, not generation or durable run history. A next-step suggestion, if later introduced, fills a draft without
automatically sending or overwriting existing text.

## Concurrent-work acceptance scenarios

1. Three projects with two simultaneous scheduled tasks each. Give two tasks identical names. Observe every occurrence,
   including those queued before session creation. One waits for permission, one fails verification, one has unavailable
   history, and the others continue. Results and decisions must retain their project identity.
2. While drafting in project C, review project A from Mission Control and its pop-out. Return to the exact draft and
   selection. A late save, recap response or inventory refresh for A must not modify C.
3. Cancel one admitted run and pause another schedule. Independently verify the cancelled run's producer state, continued
   execution elsewhere and future occurrences affected by pause. A transport timeout remains uncertain until reconciled.
4. Return after completion with the provider offline. Read a stored recap, inspect its timestamp/scope, open available
   evidence and identify missing evidence. No new provider request is needed just to read.
5. Run an application journey through native WebMCP, reproduce a real defect, repair it and rerun the same acceptance.
   Separately exercise a visual or accessibility defect that a successful semantic call cannot detect.
6. Close/reopen relevant views, disconnect/reconnect the runtime and restart a qualified isolated runtime. Record which
   processes, runs, UI context and history actually survive. Do not run destructive lifecycle tests on the user's work.
7. Create a task with startup zone A, choose override B, restart with system zone C, then edit it. B remains. Add DST gap,
   repeated-hour and next-occurrence cases against the canonical scheduler; the current gap repair is not full DST proof.

The existing six-task test proves bounded runtime dispatch with a mocked prompt, not live provider/MCP isolation.
Qualification requires both fixture-controlled failures and a separately authorized live service journey. Twenty-task
load testing characterizes limits; it does not establish an advertised capacity. Runtime execution, external operations
and approval scope remain unchanged.

RS-07 is a contract-dependent requirement, not a claim the pinned SDK already exposes every occurrence field. Trace
producer IDs, states and read-back first. Missing fields prevent qualifying the affected scenario until producer contracts
are supplied; Desktop must not invent canonical IDs or states to complete its display.

Each receipt records build/profile, execution backend (fixture, mocked prompt or live provider), and observation method.
Qualify Desktop's own UI through its unpackaged development adapter; qualify user-project browser workflows separately
on the intended packaged build. The developer adapter remains disabled in packages. Passing either path does not qualify
the other, and a fixture pass cannot become a live-service claim.

## Visual and interaction direction

Use compact rows with a stable primary line for task/state and a persistent secondary line for project/context.
Color supplements readable labels. Put details and full evidence in the existing inspector/session rather than adding
every identifier to the list. Keep a current selection stable while events arrive; updates must not move another
permission action under keyboard focus.

The recap belongs near the resume action and on the return surface. Provide full readable text without hover, with
adequate contrast in light/dark themes. Running work should not animate over the user's current reading or typing.
Screenshots, focus/bounds checks and keyboard journeys qualify layout; observed user tasks qualify comprehension.

## Product value and measurement

Use the existing verified-outcomes-per-human-attention-hour hypothesis. Establish a baseline before setting claims.
For each scenario record time to identify the right project and blocker, time to a useful next action, navigation count,
wrong-context attempts, stale/false-success presentations, review minutes, provider cost and reopened defects.

Proposed pilot: use the same task fixtures in the current and proposed AX experience with five representative users.
Report individual results and medians; do not infer population-wide productivity from a small pilot. Automated gates
require zero observed cross-project mutations and false success in the scoped fixtures. Comprehension improvement remains
a hypothesis until measured.

## Deliberate exclusions

No new terminal runtime, remote-host manager, container/Spaces backend, automatic approval, automatic recurring recap
spend, or rewrite to a competitor's framework. Do not replace AX contracts with OpenCode/OpenChamber payloads.
No claim that WebMCP is exclusive to AX or that general click automation proves a unique advantage.
Desktop's developer UI tools remain opt-in and unpackaged; exposing them in a public product needs a separate decision.

Implementation follows accepted ownership: Desktop projections; AX Code coding/worktree/verification contracts;
AX Agent durable orchestration when ready; AX Trust policy/credentials; AX Telemetry observability.
