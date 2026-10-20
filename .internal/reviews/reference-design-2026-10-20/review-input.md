Return the substantive review directly. Do not announce a plan or request tools.

Review this proposed AX Code Desktop design direction. Be skeptical and concise. This is source/documentation research, not a live competitor benchmark. The references and facts below were independently inspected; do not invent additional features. Identify at most three consequential mistakes or omissions and give concrete acceptance criteria. Do not recommend a new runtime, automatic permission expansion, or new infrastructure. Reply in English.

# Design comparison: OpenChamber, Orca, Herdr and OpenCode

Date: 2026-10-20. Scope: read-only local source and test inspection, repository image inspection, and online primary-source
research. This is design input, not a comparative benchmark or an interactive qualification of the four products.

## Evidence and version boundaries

The user requested both `.internal/reference` inspection and online research. Local references were neither updated nor
modified. Some contain untracked files; the inspected evidence listed below belongs to the recorded commits.
Repository screenshots can predate their containing commit. They establish layout examples, not current behavior.

| Reference | Local commit inspected | Remote HEAD observed during this review |
| --- | --- | --- |
| OpenChamber | `ad73d11a6e7cafa0880e238f92ba7cf5cf2cb1fd` | Same |
| Orca | `bd7633f6eb5e468c5220be77909071cddc466af4` | `509f19867cbfe2a87b1ac7b077801f4ba27a44a0` |
| Herdr | `143bf5fd4781d164260c63fe28e7dc08054ad32f` | Same |
| OpenCode | `31dc762147190f1803dd52bb0909c5163e6cc467` | `b81629e4c973d8441b8a17cd2944d0cc6849713e` |

Remote observations came from `git ls-remote origin HEAD`; they do not establish the release version or that online docs
match that hash. AX Code Desktop baseline is `ac6310b3`, including the independently verified permission-picker repair.

## Design findings

### OpenChamber: make unfinished work and return context visible

Its local `sessions-in-work.mdx` describes a persistent unfinished-work collection, separate from all session history.
Scheduled runs are explicitly excluded from that collection. Compact tree rows defer project/branch context to hover or
an optional detailed mode. The documented recap and suggested follow-up help users resume; selecting a suggestion fills
the composer without sending it. [Online workflow documentation](https://docs.openchamber.dev/sessions-in-work/).

The local implementation is more informative than a feature checkbox:

- `packages/ui/src/lib/sessionAssistMetadata.ts` associates assistance with an answer and generation time; its shared
  freshness check compares generation with session idle time and rejects reverted sessions.
- `packages/ui/src/hooks/useSessionAssist.ts` gates assistance on idle state and delays the chat recap for one minute.
- `packages/ui/src/components/chat/SessionRecapSpacer.tsx` places a short, clamped recap above the composer.
- `packages/ui/src/components/session/sidebar/sessions/SessionNodeItem.tsx` also consumes the shared freshness check.
- `packages/ui/src/components/views/SpacesView.tsx` retains a previous list alongside a read error and avoids presenting
  the error as an empty inventory.

The inspected `docs/references/desktop_light.png` shows an unfinished-work sidebar, a central conversation, optional
context details, and a subdued recap just above the composer. This supports a useful placement hypothesis. Its low visual
emphasis and truncation need accessibility and discoverability testing before adoption.

**Adapt:** a visible, immediately readable return summary, shared freshness rules across surfaces, and stable retained
context on read failures. **Change for AX:** scheduled outcomes must remain discoverable in portfolio supervision;
project identity cannot depend on hover. An existing saved recap should not wait a new minute after the user returns.
Do not copy its metadata shape or background generation service into Desktop.

### Orca: organize execution around workspaces and finish the review loop

The local parallel-agent recipe creates independent worktrees, runs alternatives, and reviews their diffs before choosing
one. Its notification documentation describes an unread inbox that navigates to the relevant worktree and pane.
The sidebar image `docs/site/public/docs/ways-to-run-local-sidebar.png` exposes host, workspace and nested agents.
These are useful context layers; the narrow image also shows how quickly long names truncate.

`SettingsFormControls.tsx` provides consistent label/description/control rows and accessible naming.
`ShortcutFilterRail.tsx` separates local action/chord search from global settings search and supports modified, unassigned
and conflict filters. Its associated tests are source evidence; they were not executed in this review.

Its local CLI guide already describes snapshot, click, fill and fresh-snapshot browser automation. Consequently, browser
control or a tool catalog alone is not an AX differentiation. [Online CLI overview](https://www.onorca.dev/docs/cli/overview).
Design Mode adds element HTML, styling and image context to an agent request.
[Online Design Mode documentation](https://www.onorca.dev/docs/browser/design-mode).

The local automation guide and current online guide both cover explicit targets, timezone, run history and filters.
The online guide additionally describes detail-view keyboard navigation and disconnected SSH automation management
that are not stated in the inspected local guide; these are online documentation observations, not locally verified
features. [Online scheduled automations](https://www.onorca.dev/docs/cli/automations).

**Adapt:** project/worktree identity, a short path from a finished run to its diff and evidence, explicit schedule target,
and consistent settings grammar. **Do not assume:** multi-agent agreement proves correctness, simultaneous runs are always
cheaper, or terminal idle means the requested outcome passed. The local parallel recipe makes optimistic claims about
agreement/cost; those need independent measurements. A worktree isolates files, not ports, credentials or external writes.

### Herdr: optimize for attention and explain what survives

`src/workspace/aggregate.rs` ranks blocked panes above unseen idle panes, then working, seen idle and unknown. Its tests
explicitly cover unseen completion taking priority over ongoing activity. The local image `assets/screenshot.png`
separates a compact workspace/agent list from the terminal panes, with a visible focused-pane border.

This is a strong attention-management pattern. However, its detection docs explain that recognized screen patterns and
integration reports have different reliability. Screen fallback can label an unfamiliar prompt idle. Those labels must
not be treated as authorization or proof of task success. [Current state model](https://herdr.dev/docs/concepts/).

The persistence documentation separates client detachment, layout restoration, screen replay and native conversation
resumption. Processes survive an ordinary detach; a server restart does not preserve the original processes.
[Current restoration matrix](https://herdr.dev/docs/session-state/).

**Adapt:** blockers and unread results should be easy to find without watching every running agent; unknown is an explicit
state. Explain close, detach, restart and resume separately. **Keep AX ownership:** Desktop displays canonical runtime
facts; it must not introduce a terminal classifier or another durable execution service. Reading a result and accepting
the result are separate actions. Do not transplant Herdr's pane lifecycle into an AX task/run lifecycle.

### OpenCode: keep execution context explicit and decisions close to the work

In the pinned local source:

- `packages/app/src/new-session/workspace/controller.ts` retains a selected destination while its inventory is loading,
  filters responses by project identity and obtains worktrees through its SDK. A transient read must not silently send
  a new task to the main directory.
- `packages/app/src/home/projects/controller.tsx` groups project navigation by server and continues authentication-gated
  actions using the saved connection rather than the rejected connection.
- `packages/app/src/session/requests/session-permission-dock.tsx` presents request resources with once/always/reject
  choices and disables decisions while responding.
- `packages/app/src/shell/notifications/coordinator.ts` coordinates notification claims across windows using Web Locks
  and bounded stored IDs, with a weaker in-memory fallback. It is not an exactly-once delivery guarantee.

The local `web-homepage-active-session.png` places conversation beside a Review panel, an example of keeping discussion
and changes close. The screenshot is a documentation asset, not evidence of the current app under load.
Online docs also describe web and terminal clients sharing the same server sessions/state.
[OpenCode web documentation](https://opencode.ai/docs/web/).

**Adapt:** preserve task destination during loading, show approval scope, prevent duplicate submission, and coordinate
interruptions across windows. **Avoid:** importing the current OpenCode SDK contract as though it were AX's pinned SDK.
For example, current OpenCode permission docs allow a WebFetch pattern map, while AX SDK 2.6.37 permits only an action
for that field. The AX editor repair correctly follows AX's contract.
[Current OpenCode permission documentation](https://opencode.ai/docs/permissions/).

## AX comparison: reuse the foundation, close the journeys

| User job | AX evidence at the reviewed baseline | Decision |
| --- | --- | --- |
| Find the project needing a decision | Projects Home, Needs You and Mission Control already exist. `sessionState.ts` shares urgency but maps retry to running; non-request rows in `NeedsYouQueue.tsx` hide the project label below `sm`. | Improve existing projections, visible identity and waiting explanations. Do not add a competing dashboard. |
| Return and understand the outcome | No `lastRecap`/`session.recap` consumer was found in the inspected UI. SDK 2.6.37 has `lastRecap: {text,time,scope}` and a recap endpoint; runtime `session/recap.ts` persists a bounded display hint. | First display the canonical saved hint with explicit limits. Rich verified outcome records need producer evidence links; a text hint cannot become a verification receipt. |
| Supervise simultaneous schedules | Existing schedule sidebar/history and repairs are present. Earlier six-task runtime tests use a mocked prompt boundary. | Qualify real Desktop multi-project state and provider/MCP isolation separately. Expose admitted occurrences before a session exists. |
| Know when a task runs | Startup timezone is cached once per renderer lifetime; new drafts use it and existing schedules preserve their stored zone. | Keep the requested startup behavior. Persist an IANA zone; explain next execution in that zone, independent of later device travel. |
| Trust settings edits | Native WebMCP found real name, layout, save-race and permission-contract defects; these have individual regression records. | Keep expected/observed evidence and repeated journeys. An inventory is coverage discovery, not proof every control works. |
| Verify a web feature | Desktop has a development-only native UI WebMCP adapter and a separate project-browser path. Packaged apps disable the developer adapter. | Build value around acceptance workflows, failure reproduction and reviewable evidence. Productize only through the existing ownership/qualification process. |

## Best-practice proposal

The shared design lesson is to minimize the work a person must do to understand and trust parallel work.
Our proposed differentiator is **a coding outcome that can be exercised, independently checked, and resumed with its
evidence across projects**. This is an AX product hypothesis, not a claim competitors cannot do it.

WebMCP's structured page tools are a useful mechanism; Chrome's documentation alone does not establish support in an
arbitrary app or the exact pinned Electron engine. [Chrome WebMCP documentation](https://developer.chrome.com/docs/ai/webmcp).
Separate semantic workflow tools from UI interaction fallback, retain visible effects, and verify completion independently
of the invoked tool's success response.

Prioritize trustworthy identity and state, return summaries, and schedule outcomes before adding more panels or more
agent-provider choices. Reuse the existing portfolio, request store, runtime and browser. Measure human orientation time,
wrong-context actions, false success, review effort and cost per accepted outcome; do not revive a static competitor score
as the product target.

The concrete requirements and sequencing are in the
[design PRD](../prd/PRD-2026-10-20-reference-informed-supervision-v1.md) and
[plan](../plans/PLAN-2026-10-20-reference-informed-supervision-v1.md).


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
