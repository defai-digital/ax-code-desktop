The packet supports a review desk for AX-native lanes. It does not support copying Herdr’s process host, and it does not contain primary docs for Claude Code, Grok CLI 4.7, or Muse CLI. Those harnesses appear only as Herdr TUI mentions. Claims below are source observations unless marked inference, proposal, or unknown. Nothing here was executed.

## 1. Job and gap split

Prioritize one job: help a person assign a coding question to a small set of AX lanes, see who is running on which provider and worktree, notice a failed lane, and choose what to integrate by hand.

Keep the four ideas separate:

| Idea | Packet status |
| --- | --- |
| Multi-model | Observed in source. MultiRun is 1–5 models, shared agent, per-lane provider/model/variant. Council fans out structured reviews. Arena compares plans and can implement in isolated worktrees with verification-first ranking. |
| Multi-agent | Observed in the pinned runtime: `task`, `task_parallel`, `waitfor`, background handoff, model-pool alias resolution. Desktop child summaries do not show role, model, assignment, handoff, worktree, or revision. |
| Multi-harness | Not observed. The agent selector is an AX Code agent, not a Claude, Grok, or Muse executable. |
| Durable orchestration | Desktop supervised quit stops the web server and runtime supervision. Saved history, a still-running original process, and reboot recovery are different. AX Agent ownership stays behind ADR-007 until a released versioned contract and consumer tests are shown. This packet does not check whether a newer release meets that bar. |

Already present, at source level only: parallel model lanes, default Git worktree isolation, concurrent prompt dispatch, council and arena, parent/child tasks with per-writer worktrees, portfolio supervision, Mission Control, compare cards, and text fusion. Live provider concurrency is explicitly unqualified. The November report’s six-task dispatch used a mocked prompt boundary.

Product-flow gaps on those surfaces: lane identity is not what the person sees at a glance; one agent selector covers the whole MultiRun launch; fusion is last-assistant-text synthesis; child error/review can lose to a running tree in the rolled-up state; the four-session high-touch figure is a UI hint. Discoverability of Council and Arena is unknown.

Producer gaps: a supervision record rich enough for role, model, worktree, handoff, and revision, if the published SDK does not already supply it; a durable lease/recovery contract if quit-survival is required; any foreign-CLI status contract. A bounded settings search found no `agents.model_pool` editor. That is not proof the pool is uneditable elsewhere.

Herdr’s real difference is running other programs, with OSC 7501 for semantic status, while a client disconnects. A process without reporting still runs. Herdr’s own FAQ separates reboot recovery from continuing the original program. Parent/child process status is not AX goal verification. Onorca already has agents, worktrees, and review, so those are not a unique AX claim.

## 2. Fit

**A. AX-native team workflow. Recommended first.** Desktop already owns portfolio, registry, desired state, exceptions, and project UX. MultiRun, Council, Arena, and runtime tasks already exist. This spends the next increment on assignment, visibility, failure, and handoff.

**B. Arbitrary CLI/PTY hosting in Desktop. Poor fit.** It creates a second coding runtime, which the boundary forbids. Semantic status still needs a protocol. Quit-survival is a supervisor with different ownership, not a view change. Foreign CLIs also pull credentials and audit toward AX Trust. Build this only as a rejected default.

**C. Bounded external-agent adapter, owned outside Desktop. Valid later, underdetermined now.** Shape: process identity, status events, worktree, artifact pointer, cancel, cost. Desktop renders that contract. Screen-scraping is the wrong design; Herdr’s App/core path is status reporting, and its TUI screen manifests are a different product. Proposal: AX Code owns the adapter when the foreign tool is a coding session with worktrees and verification; AX Agent owns it when the requirement is a lease that survives Desktop quit. Which one applies is unknown until the job is named.

User evidence that would reorder this: a cohort whose accepted changes depend on a foreign harness’s tools or memory, rather than on model choice; a measured quit-survival job, which moves the work to an AX Agent contract check; or live proof that Council, Arena, and MultiRun already match single-session acceptance, which shrinks the Desktop increment to exception display only. This packet cannot decide C, because Claude Code, Grok CLI, and Muse were not sourced.

## 3. Minimal workflow on current surfaces

Call it an assigned review lane. No new orchestrator, and no automatic consensus, approval, or merge.

1. The person picks a registered project and starts from MultiRun, Council, or Arena. The shared agent stays as it is. Per-lane role is a Desktop label until a producer field exists.
2. Show provider, model, and variant from `metadata.multiRun` on the supervision row and compare card. For task children, show model as unknown when the summary type lacks it.
3. Git lanes keep separate worktrees. Show the worktree beside the diff count. For non-Git runs, warn that lanes share a directory; parallel writers need isolation.
4. Review stays Open / Review changes / Since you left. The person chooses a lane. Fusion stays available and is labeled synthesis of assistant text. Integration remains the existing human review path, with the chosen worktree and diff as the artifact.
5. Portfolio exceptions list child permission, question, error, and review even when the parent tree is running. The launcher shows created session IDs and `startedRunCount` as separate facts. Retry and cancel stay on whatever session controls Desktop already has. No new control API is assumed.

## 4. Split the increment

**Desktop only.** Render existing MultiRun provider/model/variant. Stop presenting child rows as if they had role or worktree. Keep child failure visible under a running parent. Label fusion as text synthesis. Prefer `metadata.multiRun` for fusion source identity after the follow-up below. Warn on shared-directory parallel runs. Explain Council and Arena in the launcher that already mounts `WorkModeSelector`. Do not add a model-pool editor until an editable surface is verified.

**AX Code / SDK, proposal only.** If the SDK does not already expose them, a child/supervision DTO needs role, provider, model, variant, worktree, assignment, last handoff, and revision or diffstat. A lane receipt needs session, worktree, verification, and error, separate from assistant text. Check the published SDK before naming these as new. Partial-start and cancel behavior must be read, not invented.

**AX Agent.** First action is a contract check against ADR-007: released versioned contract plus consumer tests. Absence from this packet is not absence in the product. No Desktop detach shim.

**External agents.** Out of the first increment. A PRD starts only if the pilot records a specific foreign-harness job.

## 5. Objection, risk, pilot

The strongest argument against A: people who already work in Claude Code, Grok CLI, and Muse may want those programs supervised, not a clearer AX team. If AX workers are weaker in tools or memory, model chips on the wrong workers do not win the job. Live quality is unknown, so that objection stands.

The highest-risk assumption: source-level MultiRun, Council, Arena, and `task_parallel` behave correctly with real providers. The packet excludes that qualification. A silent Council fallback prompt, a leaked worktree, or a masked child error would mean “use the existing surfaces” ships a broken desk.

Pilot, pre-register the pass rule. Eight to twelve internal developers, two weeks, existing projects, current pinned runtime, no budget increase and no new runtime. About twenty real tasks, split between single-session control and one AX lane path (MultiRun with two or three models, or Arena implement). Humans review diffs and accept by hand.

Record: human acceptance rate; minutes to a lane decision; share of lanes where the person can name provider, model, and worktree without opening raw metadata; count of parent-running/child-failed cases; orphan sessions and worktrees after partial start or cancel; times fusion is treated as merge; provider spend per accepted change.

A fails if acceptance does not beat the pre-registered single-session margin, or if people abandon for a named foreign capability. Detach-after-quit routes to the AX Agent contract check. A missing tool or memory routes to adapter PRD. Hidden child failure or fusion confusion confirms the Desktop increment and still fails the product bar until fixed.

Keep the minority on the decision: “This pilot uses AX-only workers and cannot disprove multi-harness detach.” Each participant answers, “What did you almost run in Claude Code, Grok CLI, or Muse instead?” Specific answers remain attached and block any claim that external agents were tested.

## 6. Follow-up before new features

1. Fusion source selection still uses parsed group titles and project resolution, while comparison prefers `metadata.multiRun`. Renames and repeated launches need a bounded behavioral check before anyone trusts synthesis. This is the sharpest correctness risk in the packet. It is not yet a demonstrated bug.
2. Rolled-up state lets tree-running outrank a child’s error or review. Confirm whether Portfolio can show a healthy parent over a failed lane.
3. Non-Git runs share a directory when `isolateRuns` is false. Confirm concurrent writers can hit the same tree.
4. Council and Arena fall back to a prompt when the slash command is unavailable. Confirm whether the UI can still say Council while one model answers.
5. Sessions and worktrees are created in a loop, then prompts go out with `Promise.all`. Confirm orphan and retry behavior when a later send fails. `created` versus `startedRunCount` is the clue.
6. Determine whether child summaries drop SDK fields Desktop already receives, or the producer never emits them. That choice decides a UI change versus an SDK contract.
7. Check current AX Agent releases against ADR-007. Do not sequence durability off a historical deferral.
8. Confirm external runtime connections on quit. Supervised `stopBackgroundServices` does not describe every ownership mode.

Until item 6 is done, adding summary fields risks inventing a contract or duplicating one. Until items 1–5 are done, a new orchestration feature would sit on an untrusted desk.
