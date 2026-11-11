## 1. Retract or narrow

I retract the claim that CLI hosting means a new Desktop runtime. A PTY terminal already exists (`TerminalView`, `terminalApi`, node-pty). A person can run a CLI as a shell program. What is still unevidenced is supervised-agent registration, bounded dispatch and result receipts, and an independent process lifetime. Expanding that terminal into an agent-aware supervisor remains a real alternative, with ownership, recovery, and verification cost. Detached execution and remote machines stay separate producer-owned lifecycle work.

I retract any new SDK DTO for provider, model, agent, variant, cwd/root, time, errors, or token counts. SDK 2.6.69 `AssistantMessage` already has those as last-observed facts after messages load. They do not describe a not-yet-started child or its future model. MultiRun metadata has `groupId`, `variantId`, `model`, `agent`, and worktree; it does not store model variant. Dispatch-time variant is not a stored variant. Absence stays an explicit unknown. `agents.model_pool` already exists; `task.queue` `model` is optional and unknown until validated against current config APIs.

I retract “the work-mode fallback necessarily bypasses policy.” It tells the main model to invoke council/arena and may still hit the real tool and its checks. The open question is whether the requested ensemble ran, and how partial or unavailable members appear.

I retract changing canonical rollup so a finished child’s review or error overrides a running tree, and I retract paging on every failed helper. Parent precedence is intentional. Child state already exists inline and in details. The useful addition is a non-interrupting child-outcome indicator.

I retract treating `startedRunCount`, a received prompt, or `routeMessage` acceptance as execution. Acceptance, first provider call, execution, verification, and user acceptance are distinct.

I retract a Desktop winner, promote, retry, merge, or cancel engine. Arena implement mode in pinned runtime 7.30.16 already ranks verification-first. New safe retry, merge, or cancel requires that contract, not an implication.

I retract “no AX Agent release” from a missing checkout. Release readiness is unestablished.

Fusion narrows from reproduced bug to source-backed risk. Grouping still keys off title slug, runGroup, and project; identity should be metadata `groupId`. A same-project second launch can share a slug, keep a distinct `groupId`, and still fuse by title. A renamed representative can lose parse eligibility. The 8 files / 67 tests are fixture or mock coverage and omit these cases. No mounted reproduction is claimed. Suggested 20–30 percent cuts have no baseline.

I keep this: improve existing AX-native workflows first; do not build a durable multi-agent runtime inside Desktop; gate any external-agent adapter outside Desktop supervision.

## 2. Strongest failure mode

The candidate can run an unfalsifiable AX-first program. Fusion identity, launch vocabulary, last-observed versus configured model, unknown variant, and a child indicator can consume the pilot and stay fixture-level, while the external arm is read-only advice that starts afterward. That arm never sees the retained choice: people adopt a CLI for tools, memory, subscription, and workflow, not for the model id shown in AX. This three-CLI review is a feasibility receipt for advice without repository tools, not a harness comparison. Abandonment by leaving AX is invisible if only AX is instrumented.

Earlier external support, if any, is a parallel measurement probe: time-boxed read-only consultation on the same tasks, with explicit identity and model, disclosed context, timeout and cancel, member failure, output limits, provenance, spend, and a hard nonapproval banner. Writers, Desktop supervision, background lifetime, and remote machines stay out. An ADR still assigns ownership: AX Code codes, AX Agent orchestrates durable work, Trust owns policy and credentials.

The second trap is the “assignment/handoff record” and “next review action.” Those can grow a shadow contract and a promote path when `AssistantMessage`, MultiRun metadata, and Arena implement mode already hold the facts. Add a record only after a named gap survives inspection of those sources.

## 3. Smallest slice and checks

On current MultiRun and Arena surfaces, make grouping and launch language true, and show child outcome without interrupting the parent. One AX worker remains the default. Council means advice, Arena means alternatives, delegated agents mean different assignments. No always-on ensemble, no fourth top-level surface, no new runtime, no new DTO, no handoff record, no promote engine.

Acceptance checks:

- Mounted coverage: two same-project launches that share a title slug and differ in metadata `groupId` stay separate; renaming the representative keeps membership. Until that passes, the fusion risk stays open.
- The UI separates `routeMessage` acceptance from first provider observation, execution, verification, and user acceptance. `startedRunCount` is acceptance only.
- Loaded messages show last-observed `providerID`, `modelID`, `agent`, and variant. Configured intent comes from existing config or the dispatch argument. Not-yet-started work and absent variant render unknown. Unavailable stays unavailable.
- A completed child’s review or error stays visible inline and in details while a running tree keeps rollup precedence.
- A requested council or arena shows whether that ensemble ran and which members were partial or unavailable, including the work-mode path.
- Existing 67 tests still pass. New tests are not live multi-provider concurrency or visual qualification.
- No Desktop control is described as safe retry, merge, cancel, or promote unless the 7.30.16 Arena contract already says so.

Do not label these Desktop-only: handoff schema, detached or background lifetime, and remote machines; external consultation, identity, credentials, spend, provenance, and nonapproval; Arena ranking and retry, merge, or cancel semantics; variant persistence when dispatch has it and MultiRun metadata does not; validation of `model?: unknown` and `agents.model_pool`; whether council/arena policy ran; human integration of a verified branch; AX Agent release readiness; pilot baselines. Fusing assistant text does not merge code or certify a result.

## 4. Dissent and the signal that would move it

Preserve this dissent: an AX-only pilot cannot decide whether users want the CLI’s tools, memory, and subscription rather than its model. Two AX models agreeing are not an independent review. Fixture tests do not show live provider concurrency or user value. This three-CLI pass is not a production adapter and is not approval for external writers.

Signal that changes the recommendation: after a pre-registered baseline on matched tasks — acceptance, defects, active human review and coordination minutes, cost, and harness-specific abandonment — either improved AX misses that baseline while a bounded external harness under ADR and Trust meets acceptance and defect parity, which advances a write-capable external path, or improved AX meets the baseline with flat abandonment, which keeps external work read-only. No percent threshold before that baseline. A failed fusion reproduction narrows only the fusion item.

This is advisory, not approval. I have not re-inspected source in this round; the fusion bug remains unreproduced.
