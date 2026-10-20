# Design comparison: OpenChamber, Orca, Herdr and OpenCode

Date: 2026-10-20. Scope: read-only local source and test inspection, repository image inspection, and online primary-source
research. This is design input, not a comparative benchmark or an interactive qualification of the four products.

## Evidence and version boundaries

The user requested both `.internal/reference` inspection and online research. Local references were neither updated nor
modified. Some contain untracked files; the inspected evidence listed below belongs to the recorded commits.
Repository screenshots can predate their containing commit. They establish layout examples, not current behavior.
The [source manifest](../reviews/reference-design-2026-10-20/source-manifest.json) records 24 inspected paths, commit IDs
and SHA-256 hashes; each file's working-copy bytes were checked against its recorded Git object.

| Reference | Local commit inspected | Remote HEAD observed during this review |
| --- | --- | --- |
| OpenChamber | `ad73d11a6e7cafa0880e238f92ba7cf5cf2cb1fd` | Same |
| Orca | `bd7633f6eb5e468c5220be77909071cddc466af4` | `509f19867cbfe2a87b1ac7b077801f4ba27a44a0` |
| Herdr | `143bf5fd4781d164260c63fe28e7dc08054ad32f` | Same |
| OpenCode | `31dc762147190f1803dd52bb0909c5163e6cc467` | `b81629e4c973d8441b8a17cd2944d0cc6849713e` |

Pinned source entry points:
[OpenChamber recap](https://github.com/openchamber/openchamber/blob/ad73d11a6e7cafa0880e238f92ba7cf5cf2cb1fd/packages/ui/src/lib/sessionAssistMetadata.ts),
[Orca settings](https://github.com/stablyai/orca/blob/bd7633f6eb5e468c5220be77909071cddc466af4/src/renderer/src/components/settings/SettingsFormControls.tsx),
[Herdr attention priority](https://github.com/herdrdev/herdr/blob/143bf5fd4781d164260c63fe28e7dc08054ad32f/src/workspace/aggregate.rs),
[OpenCode destination selection](https://github.com/anomalyco/opencode/blob/31dc762147190f1803dd52bb0909c5163e6cc467/packages/app/src/new-session/workspace/controller.ts).

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

Muse's bounded advisory review and the two unsuccessful Grok attempts are recorded
[separately](../reviews/reference-design-2026-10-20/README.md), including independent disposition of each substantive
finding. The resulting proposal explicitly gates missing producer contracts and separates development UI verification
from packaged project-browser qualification.
