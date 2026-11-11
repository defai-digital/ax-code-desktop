# AX Code Desktop collaboration: Herdr gap review and proposed fit

Date: 2026-11-10. Status: Research complete; recommendation proposed, not an accepted architecture change.
Desktop baseline: `84d684f8c06f65dc15cae7b5495a94de56efa685`, version 7.30.16.
Runtime pin: 7.30.16; SDK pin: 2.6.69. Runtime source was inspected at tag `v7.30.16`, commit
`565368bcb237d7814ac7bf725a548565d85e1ccb`, separately from its newer local HEAD.

## Recommendation

Make the existing execution paths understandable and dependable as a task-first collaboration experience: assign bounded
work, see who is doing it and where, review independent findings, then integrate verified changes deliberately.

AX already has API/local providers, vendor CLI bridges, multi-model modes, delegated agents, worktrees, supervision and
review. The immediate investment should connect and qualify those assets. A new terminal multiplexer, provider adapter,
or Desktop-owned durable manager is not justified by this review.

Keep one worker as the default. Add collaborators when the task benefits from independent review, separate assignments
or competing approaches. Explain those choices in the existing composer, Workspace, Portfolio and Review surfaces.
Do not make every task an ensemble or require users to learn another dashboard.

Persistent native CLI sessions, detached execution and remote-machine supervision are meaningful Herdr advantages to
evaluate separately. They are not equivalent to model diversity, saved conversation history or a background queue.
Their value must be tested with users who already depend on external harnesses, not just existing AX users.

## What was actually checked

- Current Desktop source, accepted ownership decisions, installed SDK types and pinned runtime source; 45 source entries
  with hashes are recorded in the [manifest](../reviews/herdr-fit-2026-11-10/source-manifest.json).
- Fresh official Herdr App/core, Herdr TUI, Orca and ACP documentation. Competitor applications were not executed.
- Three rounds of direct CLI consultation: independent review, cross-challenge, and a final material correction.
  All nine consultations completed with substantive output. Reviewers had curated English evidence, no repository tools,
  web tools or delegation. Their advice was independently checked rather than treated as approval.
- Existing focused behavioral tests: 8 files / 67 passed. A later provider/launcher/work-mode check passed 3 files / 54
  tests with concurrent work present. Neither run is live provider or visual qualification.
- Two additional mounted-component probes reproduced a fusion identity defect. Their intentional failures are findings,
  not a claim that an existing gate failed. Product code was not changed.

The gitignored wiki and the older local Herdr reference checkout were unavailable at their documented paths. Historical
October reports were useful navigation, not current implementation evidence. This review used current source and fresh
official documentation instead of treating the old Herdr hash as current.

## Capability and gap inventory

| User need | Existing AX evidence | Remaining gap or qualification |
| --- | --- | --- |
| Different providers and models | MultiRun model selections carry providerID/modelID/variant; lanes send concurrently | Real-provider selection, concurrency, failures and cost need an in-product qualification |
| Use vendor CLI login/subscription | SDK CLI provider IDs: `claude-code`, `codex-cli`, `grok-build-cli`, `muse-cli`; ProvidersPage has Use CLI flow | Exact CLI/version/model compatibility and native permission behavior need receipts |
| Multiple AX agents | Pinned runtime `task`, `task_parallel`, background handoff, `waitfor`, messaging and authorized model pool | Assignment and handoff visibility; distinguish AX agent definitions from executable harnesses |
| Multi-model advice or alternatives | Council and Arena work modes; Arena also has isolated implement mode with verification-first ranking | Explain choices; show which members actually contributed, failed or were unavailable |
| Parallel coding isolation | MultiRun defaults to worktrees for Git; runtime parallel writers also have worktree support | Isolation can be disabled; non-Git runs share a directory. Do not advertise general multi-writer safety |
| Attention across projects | Shared supervision projection, child states, Needs You, Portfolio, activity and evidence | Richer child context and non-interrupting outcomes; preserve purposeful running-parent precedence |
| Compare results | MultiRunCompare, Review changes and text fusion | Confirmed identity defect; synthesis must not imply code integration or verification |
| Run arbitrary commands | Existing AkiTTY terminal UI, terminal transport and node-pty shells | A shell process is not automatically a registered semantic agent or durable task |
| Keep running after quitting the app | External runtime ownership can differ; supervised quit explicitly stops the managed runtime | No qualified Herdr-style detached lifecycle for managed execution |
| Remote-machine fleet | No qualified product contract established by this review | Separate producer-owned requirement; do not infer fleet support from event reconnection |

Desktop sources: [MultiRun types](../../desktop/packages/ui/src/types/multirun.ts),
[launch implementation](../../desktop/packages/ui/src/stores/useMultiRunStore.ts),
[mode routing](../../desktop/packages/ui/src/lib/workMode.ts),
[provider flow](../../desktop/packages/ui/src/components/sections/providers/ProvidersPage.tsx),
[supervision projection](../../desktop/packages/ui/src/hooks/useSupervisionRows.ts),
[terminal runtime](../../desktop/packages/web/server/lib/terminal/runtime.js),
[Electron lifecycle](../../desktop/packages/electron/src/main.js).

### The CLI bridge distinction changes the decision

The first review packet did not include `provider/cli`, and reviewers consequently overstated the absence of external
harness integration. Inspection of the installed SDK and pinned runtime corrected this. Their final reviews explicitly
withdraw those claims. Earlier consultation outputs are retained as advisory history, not the final capability inventory.

The pinned bridge maps provider IDs to real executables, supplies a working directory and sanitized environment, passes
concrete model selections, parses results and implements timeout/cancellation cleanup. It can use native CLI tools; it is
not universally read-only or merely a hosted-model API. It reuses vendor CLI login rather than requiring a new hosted key.

It is also one-shot: AX conversation history is flattened into a prompt, a subprocess handles the turn, and its own
background jobs cannot deliver completion across subsequent subprocess turns. The existing prompt explicitly warns
about that boundary. This is materially different from a long-lived native agent terminal that can be resumed or taken over.

Existing permission flags are not a reason to assume policy equivalence. For example, the pinned Muse definition supplies
`--approval-mode never --disable-approval --trust-workspace`. Native tool/approval provenance, permission mapping and
process-tree cleanup require producer-level qualification before stronger collaboration claims. Setting cwd or using a
Git worktree does not sandbox filesystem access, network calls, ports or other external side effects.

Primary pinned source: `packages/ax-code/src/provider/cli/{config,prompt,cli-language-model,native-models}.ts` and
`docs/providers/supported-providers.md`; hashes and commit are in the manifest. This is source evidence, not a claim that
the currently installed CLIs have passed through the production bridge.

## What to learn from Herdr, and where AX should differ

Herdr App/core puts long-lived terminal programs below a replaceable client and lets one agent launch, steer and collect
another. It also aggregates SSH machines. This provides a clear execution location and direct takeover path.
[Official core description](https://herdr.dev/core/)

The new App uses OSC 7501 program-reported status; the original TUI uses a separate server and combines screen rules
with integrations. They do not share their agents. It would be inaccurate to describe App/core as screen-scraping TUI.
[App/version distinction](https://herdr.dev/), [TUI agent detection](https://herdr.dev/tui/docs/agents/)

TUI prompt/wait/read are useful coordination primitives, but a settled terminal state does not prove a particular turn
passed its acceptance checks. Its restore documentation separately describes process survival, layout, history and native
session resumption. AX should adopt that precision in its own lifecycle claims.
[TUI automation](https://herdr.dev/tui/docs/agent-automation/),
[TUI restoration](https://herdr.dev/tui/docs/session-state/)

Orca already combines agents, worktrees, review and programmatic orchestration. These are useful foundations, not sufficient
claims of unique AX value. [Orca overview](https://www.onorca.dev/docs),
[orchestration](https://www.onorca.dev/docs/cli/orchestration)

AX's proposed advantage is an accountable path from a task to independently reviewed, verified changes across a portfolio.
It should retain canonical goals, worktree and evidence ownership while making vendor CLI limits explicit. This is a product
hypothesis, not a measured advantage over Herdr or Orca.

ACP is worth evaluating when a desired agent actually supports it. Initialization negotiates versions and capabilities;
omitted capabilities are unsupported. Protocol cancellation is not a universal guarantee of child-process termination or
durable recovery. No evidence here establishes ACP support for every requested CLI.
[ACP initialization](https://agentclientprotocol.com/protocol/v1/initialization),
[cancellation](https://agentclientprotocol.com/protocol/v1/cancellation)

## Confirmed correctness finding before feature expansion

**F1 — Fusion and comparison disagree about run identity. Priority: fix before expanding team/fusion flows.**

Comparison prefers `metadata.multiRun.groupId`; `MultiRunFusionDialog` still selects by parsed title slug/runGroup and
project resolution. The mounted component reproduced both consequences:

1. Two lanes in launch A plus a lane in launch B, all in the same project and sharing a title slug: fusion showed three
   sources where only launch A's two sources were expected.
2. Rename launch A's representative while preserving its metadata: fusion showed zero sources where two were expected.

The existing seven fusion fixtures passed in the same probe run. Stores were mocked and the actual fusion component was
mounted. This verifies source-list behavior, not a live cross-provider disclosure or a completed model request. No claim
is made about a production incident.

[Component](../../desktop/packages/ui/src/components/multirun/MultiRunFusionDialog.tsx),
[metadata-first comparison](../../desktop/packages/ui/src/lib/supervision/multiRunGroups.ts),
[reproduction script](../reviews/herdr-fit-2026-11-10/run-fusion-probe.py),
[failure evidence](../reviews/herdr-fit-2026-11-10/fusion-probe.log).

Proposed repair: use the same stable identity resolver for comparison and fusion, retain deliberate legacy fallback,
support renamed metadata-backed lanes, and add permanent regressions. Unknown project identity and legacy title matching
need explicit behavior. This research does not implement that repair.

## Workflow and first delivery slice

The primary flow should answer five questions: What is the assignment? Who owns it? Which execution path is being used?
What did it produce? What should the person do next?

1. Start in the registered project and state the goal and acceptance checks. Default to one worker.
2. Use Council for independent advice, Arena for alternatives, delegated AX agents for separate assignments, or MultiRun
   for explicit lanes. Vendor CLI bridges can be execution choices through their existing provider path.
3. Show each assignment's project/worktree, agent, configured model and runtime-reported execution facts. Show unavailable
   data as unavailable. Preserve individual child outcomes without interrupting for every failed helper.
4. Present the exact selected diffs, verification scope and unresolved review objections. Text synthesis is an aid to
   reading; it does not merge branches, certify a result or remove a minority finding.
5. The person chooses the next action through existing review and PR tooling. Worktree cleanup, retry and cancellation
   need their existing producer semantics preserved; a new button must not invent safe behavior.

### First slice: trustworthy identity and execution visibility

- Repair F1 and qualify repeated-name/rename scenarios before additional team actions.
- Expose execution kind and known model/context on existing row/detail surfaces. Distinguish configured selection,
  runtime-reported model and vendor-reported resolved model. A CLI alias/default may not identify its eventual model.
  In this consultation Grok was requested as `grok-4.7` but its native usage reported `grok-4.7-build`.
- Reuse loaded AssistantMessage provider/model/agent/variant/path/time/error/token fields. Do not add a redundant SDK DTO.
  These fields do not establish the future model of a queued child or independently attest a vendor's internal routing.
- MultiRun metadata has model/agent/worktree, but no model variant. Do not invent a persisted variant from display text.
- Preserve the existing aggregate partial-start toast. It already compares planned runs and accepted sends. Investigate
  persistent per-lane recovery information separately. Accepted send, provider observation, execution, verification and
  user acceptance are different facts.
- Explain the existing modes and one-shot CLI lifecycle where users select execution. Ensure requested Council/Arena
  membership is compared with actual results. A compatibility prompt may still invoke the real tool; it does not prove
  either policy bypass or successful ensemble execution.

Desktop owns the projection and interaction changes. Config already contains `agents.model_pool`, and task queue event
`model` is optional `unknown`; inspect and validate existing config/event surfaces before proposing a model-pool editor or
new contract. New assignment revisions, handoff receipts, admission/lease guarantees or native permission facts require
their canonical producer, only where the existing contracts lack the needed semantics.

### Qualify the existing bridge before adding another adapter

Use a disposable profile/repository and record Desktop/runtime/SDK versions, CLI version, execution flags and selected
model. Start with one bridge, then qualify the others separately. A successful Claude bridge test cannot qualify Muse.

Journey A: connect the CLI using the current ProvidersPage action, select a concrete model, submit a bounded task in a
dedicated worktree, observe output and the resulting diff, then run the existing verification/review path. Independently
check provider/model arguments and any native resolved-model receipt. Do not require information the parser cannot supply;
record that as an unsupported capability.

Journey B: exercise authorized read-only Council membership with an API member and a CLI member, one unavailable member,
and a controlled timeout. Verify actual participation, failure visibility and preserved dissent. **Do not assume the CLI
bridge becomes read-only because Council asks for advice.** Establish an enforceable producer capability/permission
profile first; otherwise report the scenario as unqualified rather than invoking unrestricted native tools.

Journey C: cancel a running member, reconcile the canonical outcome, and independently verify process-tree cleanup and
other lanes' continued operation. Follow with another turn to demonstrate the documented one-shot boundary. Include
partial creation, send failure and dirty-worktree preservation. UI acknowledgement alone does not pass cancellation.

Journey D: qualify parallel writers only with producer-owned worktree creation and appropriate capability restrictions;
check writes and external effects, then verify the selected revision. Worktree isolation by itself is insufficient proof.
Use native fresh-state/DOM/screenshots for UI checks; report fixtures and live-provider execution separately.

## Ownership and sequencing

| Increment | Owner and prerequisite |
| --- | --- |
| Source identity, labels, existing mode explanation, model/status presentation | Desktop; established contracts and relevant behavioral/native UI checks |
| CLI flags/capabilities, tool/approval provenance, timeout/cancel and result parsing | AX Code provider/cli and SDK producer; version-specific contract and compatibility tests |
| Coding assignments, isolation, verification and integration evidence | AX Code; preserve current authority rather than duplicate its engine |
| Durable cross-project management, leases and restart recovery | AX Agent after released-contract verification under ADR-007 |
| Enterprise credential/policy/grant and audit semantics | AX Trust; vendor-native tool permissions require an explicit mapping |
| Operational measures | AX Telemetry through an established ingestion contract; do not invent Desktop observability services |
| Persistent external native sessions or remote fleet | Separately proposed scope with an explicit producer and consumer contract; not a UI-only enhancement |

Accepted [source ownership](../adr/ADR-002-product-and-source-boundary.md) and
[AX Agent integration prerequisite](../adr/ADR-007-defer-ax-agent-manager-integration.md) remain unchanged. A read-only
GitHub lookup of the assumed `defai-digital/ax-agent` repository could not resolve it with the available access. That does
not establish absence, release readiness or the correct current repository identity. Verify the actual released contract
with its maintainers before scheduling a dependency on it.

## Consultation outcome and independent disposition

All final reviewers converge on strengthening the existing paths, subject to native tool/permission and lifecycle
qualification. This is supporting advisory evidence, not three independent product tests.

| Reviewer | Requested model / native usage report | Distinct useful contribution |
| --- | --- | --- |
| Claude Code | `claude-opus-5-5` / `claude-opus-5-5` | Correctness-first slice; distinguish configured/observed identity; challenge whether a worktree really restricts native tools |
| Grok CLI | `grok-4.7` / `grok-4.7-build` | Qualify the existing bridge and actual ensemble participation; retain per-lane evidence instead of inventing APIs |
| Muse CLI | `muse-wonder-1.0` / `muse-wonder-1.0` | Strong objection to an AX-only or advice-only pilot; test harness tools/memory/lifecycle directly |

All three final reviews withdraw the earlier absence/new-adapter claims after the source correction. The coordinator also
rejects or narrows these suggestions:

- Do not build another Promote/winner/retry engine in Desktop; Arena already implements a producer-owned alternative path.
- Do not change running-parent precedence simply to surface a handled child failure. Evaluate non-interrupting context.
- Do not equate AssistantMessage model fields with independently validated CLI routing or assume every native tool event
  is already parsed. Unknown capability/provenance remains visible.
- Do not claim cwd contains writes, cancellation notifications prove process termination, or an advice prompt disables
  native tools. Several proposed reviewer acceptance journeys need these additional producer restrictions.
- Do not use suggested 20-30 percent productivity/abandonment cutoffs as facts. No measured baseline supports them.
- Do not accept every statement in the retained reviews: one final Claude uncertainty questioned the runtime pin even
  though `config/ax-code-runtime.json` and the manifest establish it. Some second-round responses restate earlier claims;
  the final inventory above, not model agreement, determines this recommendation.

Full inputs, outputs, sanitized model-usage receipts and extraction scripts:
[consultation package](../reviews/herdr-fit-2026-11-10/README.md).

## Retained dissent and a testable pilot

**Retained objection:** users may choose Claude Code, Grok or Muse for native tools, memory, subscriptions and persistent
workflow. An AX-only or tools-disabled consultation pilot cannot falsify that preference. Conversely, more models can
multiply review effort without increasing accepted results. Detached execution might be the actual blocker.

Recruit both AX users and people who already rely on external harnesses. Establish a baseline on comparable task classes,
then compare current AX, improved existing AX/CLI-bridge flow, and the participant's native external-harness workflow.
Counterbalance task order and account for familiarity, model/harness choice and subscription costs. Do not require
participants to abandon their preferred harness before counting unmet needs.

Measure human-accepted changes with explicit verification scope, reopened defects, active coordination and review
minutes, wrong-context actions, interruptions, orphaned worktrees, provider spend and CLI allowance usage, and why the
person switched paths. Track inability to continue after closing the app separately from quality and model selection.
Use the baseline to pre-register useful improvement and non-inferiority margins; small pilot results are directional.

Advance persistent external-agent work if native workflows consistently win on accepted outcomes per human attention or
show a material harness-specific limitation that the existing one-shot bridge cannot satisfy. Prioritize lifecycle work
if quit/detach is the dominant issue. Reduce ensemble complexity if it adds cost/review minutes without better outcomes.
Each retained objection must keep its predicted observation and revisit condition; majority agreement cannot delete it.

## Concurrent work and delivery limits

During this read-only review, separate uncommitted AgentTeam work appeared in ChatInput-impl.tsx, session-ui-store.ts,
AgentTeamRow.tsx, agentTeam.ts and useAgentTeamStore.ts. It was preserved and not authored or changed by this review.
The committed baseline above remains the product inventory. The later 54-test run reflects that changing working tree.

The observed candidate uses coder/QA selections and prompt directives to existing Arena/Council paths, which is compatible
with reusing existing execution. It is not execution evidence by itself. Its eventual review should specifically verify
that composer team routing preserves explicitly selected MultiRun lane models, normal single-worker behavior, mode
boundaries and actual ensemble participation. This report does not certify or reject that concurrent implementation.

This delivery adds research artifacts and the report index only. No product implementation, accepted governance record,
dependency pin, commit, push or release was changed. No new full-build or native/live-bridge qualification is claimed.
