## Independent review — Muse CLI Wonder 1.0 perspective

I have not inspected or executed anything; below I treat the supplied D/H/O notes as curated evidence, and label **[Observed]** (in that evidence), **[Inference]**, **[Proposal]**, and **[Unknown]** separately. I also challenge the framing: Herdr is primarily a *terminal-process host*; AX Code Desktop is a *portfolio supervisor over an SDK*. Copying Herdr optimises the wrong layer.

### 1. Prioritised job and taxonomy

**[Inference] The job to prioritise:** take a human-registered project from intent to a *reviewable, verifiable diff with an accountable owner*, across many concurrent sessions, with minimal human polling. That is supervision-to-evidence, not terminal multiplexing.

| Term | Meaning | Status |
|---|---|---|
| Multi-model | Same prompt, several provider/model/variant lanes | **[Observed]** Implemented: `MultiRunGroup`, 1–5 models/group, concurrent dispatch (D1) |
| Multi-agent | Different AX Code agent definitions/roles, parent/child sessions | **[Observed]** Implemented at runtime: `task`, `task_parallel`, `task-model-pool.ts` (D3); Desktop launch uses *one shared agent* per MultiRun |
| Multi-harness | Different executables (Claude Code, Grok CLI, Muse CLI, AX Code) | **[Observed]** Not evidenced. The agent selector is an AX Code agent definition, not an executable |
| Durable orchestration | Leases, approvals, recovery across restarts, owned by AX Agent | **[Unknown]** ADR-007 deferral is historical; whether a current released contract satisfies it was not established. Do not assert absence *or* readiness |

**Already implemented (apparent Herdr gaps that are not gaps):** parallel model lanes with default worktree isolation for Git, council/arena modes in the pinned runtime, parent/child rollup in `useSupervisionRows.ts`, Mission Control, `SinceYouLeftStrip`, lane compare. Herdr's `hc run/send/wait` parity is largely present in AX-native form.

**Product-flow gaps (Desktop-fixable):** discoverability/understanding of Council/Arena/MultiRun (existence ≠ usability); `ChildSessionSummary` exposes only ID/title/state/updatedAt — no role, model/provider, assignment, worktree, or revision, so a supervisor cannot answer "who is doing what, with what, where"; no dedicated `agents.model_pool` editor found (bounded search); Fuse labelled in a way users may read as code integration.

**Needs producers (not Desktop):** execution survival after Desktop quit (D6 explicitly refutes promising this), native external-harness status, durable cross-project manager contracts, and any live provider-concurrency qualification — current evidence is source-level and mock-bounded (D7).

### 2. Three alternatives

**A. Improve AX-native team workflows.** Deepen MultiRun/Council/Arena/supervision. Pros: respects ownership boundaries, reuses goal/verification/worktree semantics Herdr lacks, no second runtime. Cons: harness lock-in; inherits unqualified live-concurrency risk.

**B. Arbitrary CLI/PTY hosting (Herdr-like).** Pros: maximal harness freedom, process survival independent of UI. Cons: creates a second coding runtime in Desktop (explicitly prohibited), terminal status is not goal verification, permission/credential/audit ownership blurs into AX Trust's domain, and D6 means Desktop-hosted processes die on quit unless Desktop reinvents Herdr-core. This is building a competitor to a sibling product inside the wrong owner.

**C. Canonical bounded external-agent adapter, owned by AX Code (producer), consumed via its published SDK.** **[Proposal]** AX Code — which owns sessions/tools — publishes a versioned contract to launch an allowlisted external CLI in an isolated worktree, send one bounded assignment, stream coarse status/output, cancel, and return exit state plus diff reference. AX Trust supplies credentials/policy; AX Agent may later orchestrate *through* it; Desktop only renders it. No PTY hosting in Desktop, no permission expansion, status mapping explicitly lossy where a CLI reports nothing.

**Recommendation: A now, C as a gated proposal, B rejected.** A delivers on the differentiated job with assets already shipped; C keeps the external-agent door open at the correct boundary without Desktop becoming a terminal emulator.

**Evidence that would change this:** task-level user data showing harness-specific capability (a model, skill, or tool only reachable via another CLI) blocks a material share of real work — say ≥25% of pilot tasks cannot be completed AX-natively to the same verification bar — or users demonstrably abandon Desktop to live in other CLIs despite supervision. Opinion surveys would not change it; completed-task comparisons would.

### 3. Minimal workflow on existing surfaces

1. **Assign.** Register the project in Desktop; state goal and checks on the root session. Choose mode by question: Council for multi-provider *review*, Arena for *plan comparison*, MultiRun for the *same prompt across models*, `task_parallel` children for *decomposed subtasks* with distinct agent definitions. One writer per worktree; keep the Git default `isolateRuns` unless there is a stated reason — non-Git runs share a directory and must be treated as single-writer.
2. **Make lanes legible.** Lane identity is `metadata.multiRun` plus provider/model/variant and shared agent. **[Proposal, Desktop-only]** Surface those already-persisted fields in supervision rows and compare cards.
3. **Review/handoff.** Human works from Mission Control/SinceYouLeft: permission/question first (they already win in `sessionState.ts`), then review-state children, then diffs in MultiRunCompare. Handoff is the human opening the winning lane and its PR — not Fuse.
4. **Integrate.** Human selects one lane's worktree as the integration candidate and proceeds through the existing review/PR path; losing lanes are closed, their diffs unmerged. Fuse is used only to synthesise a *text* critique summary across lanes, and should be relabelled as such. No automatic consensus, approval, or merge.
5. **Failure/retry/cancel.** A failed lane stays visible with its state; retry means a new lane/session referencing the failed one, preserving evidence. Cancel is per-session using existing controls; **[Unknown]** bulk-cancel semantics are not evidenced — do not promise them. Note the attention hazard in D4: tree-running precedence can mask a finished child's error/review in the rolled-up state even though details retain it.

### 4. Increment separation

**Desktop-only first increment:** surface provider/model/variant/agent/worktree identity from data already persisted; unify compare/fusion source resolution on `metadata.multiRun`; relabel Fuse as text synthesis; add entry-point copy that distinguishes Council vs Arena vs MultiRun at the `WorkModeSelector`. No new APIs assumed.

**AX Code/SDK work (all [Proposal], none verified as existing):** extend the child-summary contract with role, model/provider, assignment, last handoff, worktree, and revision; a structured per-child completion/handoff record tied to verification results; a supported read surface for `agents.model_pool` configuration.

**AX Agent contract work:** first *establish the fact* — check the current released versioned contract and consumer tests against ADR-007's conditions. Until that check exists, Desktop builds nothing durable-orchestration-shaped and does not reimplement leases/recovery locally.

**Optional external-agent work:** ADR for option C above, allowlist-first, isolated worktrees, Trust-owned credentials, explicit "status may be unknown" rendering.

### 5. Against my own recommendation

**Strongest counter-argument:** if the best models and agent UX increasingly ship inside other vendors' CLIs first, an AX-native-only Desktop becomes a read-only dashboard over work users actually do elsewhere — supervision of an empty room. Option C mitigates but does not eliminate this: a bounded adapter will always lag a native harness's features.

**Highest-risk assumption:** that users value verified portfolio supervision over harness freedom and process aliveness — and that AX-native child/multi-lane behaviour works live at concurrent scale. Current assurance (D7) is fixture- and mock-backed; it does not qualify real providers, tools, or cancellation.

**Falsifiable pilot (pre-registered):** 8–12 real users, ~20 real tasks over 2–3 weeks, AX-native workflow (Section 3) vs their current harness of choice. Measures: time-to-first-reviewable-diff; human attention minutes (interruptions + polling, sampled); verification pass rate; rework after review; duplicate-lane cost in tokens/spend; % tasks requiring an external harness to meet the bar. **Decision rule:** if ≥25% of tasks need an external harness, or attention minutes are not lower than baseline, the A-first recommendation fails and option C is promoted from optional to committed. Cost: cap lanes per task and log spend per lane so the pilot prices redundancy honestly.

**Retaining the minority objection:** record the dissent verbatim in the decision document as a named annex with its trigger ("reopen C if pilot threshold X is hit"), assigned to a person, not summarised into agreement. Model consensus among the three reviewers must not be allowed to launder this objection away.

### 6. Correctness follow-up before any new feature

The fusion identity discrepancy deserves a bounded investigation first: `MultiRunFusionDialog.tsx` resolves sources via parsed group titles and project resolution, while comparison prefers `metadata.multiRun` identity (D5). After repeated launches or renames, Fuse could silently synthesise text from the *wrong sessions* — a plausible-looking wrong answer, worse than an error. This is **[Unknown]** as a live bug, not a proven one. Alongside it, check MultiRun partial failure: sessions/worktrees are created in a loop and prompts dispatched via `Promise.all`, while created IDs and `startedRunCount` are reported separately — establish what state a mid-loop failure leaves behind. Fix identity and partial-failure semantics before building anything on top of lanes.
