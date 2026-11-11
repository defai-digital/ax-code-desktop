## 1. Retractions and narrowings

- I retract framing CLI hosting as new forbidden PTY infrastructure. Desktop already has `TerminalView`, `terminalApi`, and a `node-pty` runtime; a CLI can already run manually as a shell program. The unevidenced step is narrower: semantic registration as a supervised agent, bounded dispatch/result receipts, and independent process lifetime. Alternative B is expanding the existing terminal into an agent-aware supervisor, with real ownership/recovery costs.
- I retract any new SDK DTO for execution facts. `AssistantMessage` in SDK 2.6.69 already carries `providerID`, `modelID`, `agent`, `variant`, `path.cwd/root`, time, errors, and tokens. That proves only last-observed execution once loaded — not a queued child's effective or future model.
- I retract adding a config endpoint before validating `Config.agents.model_pool`, existing config APIs, and the `unknown` in `task.queue.*` `model`. I also correct MultiRun: its metadata has `groupId, variantId, model, agent, worktree` but **no variant**; variant is passed at dispatch, so UI must source it elsewhere or show explicit `unknown`.
- I narrow the Fusion claim to a source-backed risk, not a reproduction: selection by title slug/runGroup/project versus comparison by `groupId` can admit a distinct second launch with the same slug, and a renamed representative can lose eligibility. Existing tests (8 files / 67 tests) are fixture/mocked coverage, not live or visual qualification, and do not cover these metadata cases.
- I retract “the work-mode fallback necessarily bypasses policy.” It may still invoke the real council/arena tool and its checks. The open question is whether the requested ensemble actually ran and how partial/unavailable members are surfaced.
- I retract changing the canonical rollup to surface every failed child. Running-tree precedence is intentional; the candidate is a non-interrupting child-outcome indicator.
- I retract equating prompt receipt with start. `startedRunCount` counts sends accepted by `routeMessage`; provider call, execution, verification, and user acceptance are separate observations.
- I retract designing a Desktop winner/promote/retry/merge/cancel engine. Arena already has implement mode with verification-first ranking in pinned runtime 7.30.16; any new behavior needs contract inspection first.
- I retract numeric 20–30% thresholds with no baseline, and any claim about AX Agent release readiness from a missing local checkout.

## 2. Strongest failure mode

The candidate can be internally correct and still answer the wrong question. Its retained objection is fatal if untested: users may choose a CLI for its tools, memory, and subscription — not its model. An AX-only pilot then selects for users already willing to live in AX, never generates the abandonment signal it waits for, and “improves” a workflow the target users still leave. Gating external writers behind AX task abandonment is circular for exactly that population.

The related failure is sequencing. Read-only external consultation proves three CLIs can return advice without repository tools — a feasibility receipt, not production value. Advice-only lanes may be strictly worse than native Council while consuming the pilot budget, and deferring detached/background and remote execution as “separate lifecycle requirements” may defer the actual blocker for long tasks regardless of model diversity.

The case for earlier external-harness support is therefore direct: a bounded, write-capable external lane in an isolated worktree, human-integrated through current tooling, is the only design that tests harness preference rather than model diversity. Read-only consultation cannot falsify it.

## 3. Smallest useful first slice

Fix launch and selection truthfulness from existing data only — no new dashboard, mode, DTO, or endpoint:

1. Compare/select Fusion groups by metadata `groupId`; show queued children as configured/intended model with variant `unknown` until a real source exists; after first message load, show last-observed provider/model/agent/variant/cwd from `AssistantMessage`; label send-accepted distinctly from provider-observed execution.
2. Add the non-interrupting child-outcome indicator without changing rollup precedence, and show whether a requested ensemble actually ran, including partial/unavailable members. Unavailable stays unavailable.

Acceptance checks: a bounded mounted-component reproduction for (a) same-project, same-slug, distinct `groupId` and (b) renamed representative — failing before, passing after, or the risk is downgraded; a queued child never displays a future model as observed; send-accepted is never labelled executing; a failed child under a running parent shows the indicator without paging or rollup change; the existing 67 tests still pass plus the new metadata cases, explicitly reported as mocked, not live/visual qualification.

**Not Desktop-only, despite appearing in Desktop discussions:** the assignment/handoff producer contract; agent-aware terminal supervision, semantic registration, dispatch/result receipts, and independent/detached/remote lifetime; the external adapter (read-only or writer) including identity/model validation, context disclosure, timeout/cancel, provenance, spend, and non-approval; any `model_pool` validation or endpoint; promote/verify/PR, retry, merge, and cancel semantics; and canonical ensemble-ran semantics. These need an accepted ADR across AX Code (coding authority), AX Agent (durable orchestration), and Trust (policy/credentials). Desktop-only is presentation over facts those producers already expose.

## 4. Dissent to preserve, and the signal that changes the recommendation

**Dissent entry:** “External-harness support as a first-class, bounded writer lane must not be gated behind AX abandonment metrics, because users who choose a CLI for tools, memory, or subscription will never enter the AX pilot to generate that metric; an AX-only pilot cannot falsify the harness-preference hypothesis.”

**Measurable reversal signal:** run matched tasks across current AX, improved AX, and an external-harness workflow after establishing a baseline, pre-registering thresholds from that baseline. If the external workflow materially reduces human review/coordination minutes or acceptance defects, or if interview-coded abandonment specifically cites CLI tools/memory/subscription despite AX quality parity, promote the bounded external writer lane ahead of further AX-native ensemble work. Conversely, if detached/remote lifetime — not model or harness — dominates abandonment, reprioritise producer-owned lifecycle before either.
