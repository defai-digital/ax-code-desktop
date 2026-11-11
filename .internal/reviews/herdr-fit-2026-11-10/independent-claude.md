# Independent review: AX Code Desktop vs Herdr

All points below rest only on the supplied evidence. Labels: **[Obs]** observed in the evidence, **[Inf]** inference, **[Prop]** proposal, **[Unk]** unknown.

## Framing challenge

The evidence contains no user data: no task logs, interviews or usage of the existing Council, Arena or MultiRun features. Three model reviewers agreeing will not supply that missing data. The Herdr framing also pulls toward terminal hosting, which is Herdr's design centre, not necessarily AX's.

## 1. User job and gap classification

**Recommended priority job [Inf]:** "Run a few bounded coding attempts in parallel and know which ones need me. Then promote one verified result into a reviewable PR without losing track of worktrees, models or cost."

The four capabilities are distinct:
- **Multi-model** (same task, several providers/models): implemented in MultiRun, Council and Arena **[Obs]**.
- **Multi-agent** (AX Code agents with roles and child sessions): implemented in the runtime via task, task_parallel and model_pool **[Obs]**. Desktop shows children only as ID, title, state and updatedAt **[Obs]**.
- **Multi-harness** (Claude Code, Grok CLI or Muse CLI as executables): absent **[Obs]**. This is Herdr's actual centre.
- **Durable orchestration** (survives Desktop quit, leases, approvals): belongs to AX Agent and is deferred by ADR-007. Current release status is **[Unk]**.

**Apparent Herdr gaps that already exist [Obs]:**
- parallel lanes with worktree isolation;
- cross-project attention rows with state rollup;
- lane comparison and diff review;
- subagent fan-out.

**Product-flow gaps [Inf]:**
- Council and Arena discoverability.
- Lane and child rows lack role, resolved model and worktree.
- Nothing connects "fuse" to "integrate". Fusion is text synthesis only **[Obs]**.
- No visible model_pool editor. This is a bounded finding, not proof.
- Retry, cancel and partial-launch handling are unclear.

**Gaps that need producers:**
- execution survival after quit (AX Agent or runtime);
- external-harness status and output (adapter producer);
- SSH or remote machines.

## 2. Alternatives

| | A. AX-native team workflow | B. Arbitrary CLI/PTY hosting in Desktop | C. Bounded external-agent adapter in an existing producer |
|---|---|---|---|
| Boundary fit | Clean | Effectively a second runtime; bypasses Trust policy and AX verification | Fits if owned by AX Code (execution) or AX Agent (workflow), with credentials via Trust |
| Status quality | Semantic, from the runtime | Lifecycle or screen-derived only (Herdr TUI caveat) | Lifecycle plus AX-run verification on the output worktree |
| Differentiation | Verification, goals, policy | None; Herdr and Orca already do this **[Obs]** | Moderate |
| Cost | Low | High, ongoing | Medium; requires ADR |

**Recommendation:** do A now. Draft C as a proposed ADR, but do not implement it until there is evidence for it. Reject B for Desktop.

Evidence that would move toward C:
- Pilot users routinely run external CLIs on the same repos alongside AX.
- Users abandon tasks because of harness behaviour, not model quality. Many of the same models are reachable as providers, so model access is not the same argument.
- Enterprise users require subscription-billed CLIs.

Evidence that would kill A's premise: users rarely run more than one lane, and their attention cost is dominated by review, not coordination.

## 3. Minimal workflow on existing surfaces [Prop]

1. **Plan (optional).** Use Council for read-only, structured review of a plan. Label the result as advice, not consensus.
2. **Assign.** Use MultiRunLauncher with one group per role or approach.
   - Each writer lane gets its own worktree. Require isolation for writers.
   - Show provider, model and variant, plus a short role label, on each lane card.
3. **Track.** Rows in Supervision and Portfolio show each lane's state.
   - Child and lane rows display resolved provider/model, worktree branch and last-updated time.
   - Where that data exists only in metadata.multiRun, use it. The rest needs producer work (§4).
4. **Failure, retry and cancel.**
   - Cancel aborts the session but **keeps** the worktree until the human discards it.
   - Retry creates a **new** lane and worktree linked to the failed one; never reuse a dirty worktree.
   - On partial launch, show created-but-unstarted lanes explicitly. The store already separates created session IDs from startedRunCount **[Obs]**.
5. **Review and handoff.** Use MultiRunCompare's "Review changes" per lane.
   - Rename "Fuse results" to something like "Synthesize notes", with copy stating that it merges no code.
6. **Integrate.**
   - The human picks **one** lane branch and clicks "Promote".
   - Promote runs AX Code verification on that branch and then opens the existing PR flow.
   - Other lane worktrees are flagged for cleanup.
   - Nothing merges automatically, and no budgets or permissions change.
7. **Ownership.** One writer session per worktree, recorded in lane metadata. Desktop warns if a second writer targets the same path.

## 4. Increments

**Desktop-only first increment:**
- Lane cards and rows show provider/model/variant and worktree, from data Desktop already persists.
- Partial-launch and orphaned-worktree visibility.
- Fusion relabelled as text-only.
- "Promote, verify, PR" assembled from existing verification and PR surfaces.
- Council and Arena hints in WorkModeSelector.
- Retry as a new lane.
- Non-Git multi-writer guard.
- Pilot instrumentation, routed through AX Telemetry if a consumer path exists **[Unk]**.

**AX Code/SDK proposals (names illustrative, not existing APIs):**
- Extend the child summary with `role`, `resolvedModel {providerID, modelID, source: explicit|agentPin|pool|parent}`, `worktree {path, branch, baseRev}` and `lastHandoffAt`.
- An integration receipt: `{laneSessionID, baseRev, headRev, verificationRunIDs, result}`.
- A read and validate API for model_pool, so Desktop can edit it safely.

**AX Agent:**
- First, establish whether a released, versioned contract and consumer tests now exist. That is a factual check, not an assumption either way.
- Only then propose worktree leases, approval gates and recovery.
- Until then, Desktop must not promise that execution survives quit. D6 shows runtime shutdown on real quit **[Obs]**.

**Optional external-agent work:**
- A proposed ADR for an adapter in which the external CLI runs in an AX-created worktree under Trust-issued credentials.
- It returns exit status, a diff and a transcript reference.
- AX runs verification afterwards.
- Status is labelled "lifecycle only".
- Deferred pending pilot evidence.

## 5. Self-critique and pilot

**Strongest argument against my recommendation:** users increasingly choose a *harness* (Claude Code, Grok CLI), not a model. Polishing AX-native lanes may be invisible to them, and Herdr and Orca will capture them while we wait for evidence.

**Highest-risk assumption:** that coordination and integration, not review effort or harness preference, is the attention bottleneck. Running N lanes may simply multiply review cost.

A secondary risk: live provider concurrency is unqualified. The six-task evidence mocked the prompt boundary **[Obs]**.

**Pilot [Prop]:**
- **Participants and duration:** 8–12 internal or design-partner developers, 3 weeks, real repos.
- **Design:** current build vs the first increment, crossover.
- **Measures:**
  - accepted PRs per active human-hour;
  - lanes launched per accepted change;
  - focus time and context switches per accepted change;
  - verification pass rate of promoted lanes;
  - abandoned lanes and leftover worktrees;
  - spend per accepted change;
  - wrong-worktree or shared-directory incidents;
  - diary entries noting each time a user ran an external CLI instead, and why.
- **Pre-registered thresholds (illustrative):**
  - Under 20% improvement in accepted changes per human-hour suggests A's flow work is not the lever.
  - Over 30% of tasks diverted to external CLIs, for harness rather than model reasons, triggers C's ADR.
  - Any shared-writer incident blocks feature work until fixed.
- **Prerequisite:** run a live concurrency qualification with real providers, including cancellation, before the pilot.

**Retaining dissent:** record each minority objection in the decision record by name. Each entry should state its predicted observable outcome and the threshold that would vindicate it. Re-read these entries at the pilot readout rather than folding them into a consensus summary.

## 6. Correctness follow-ups before new features

1. **Shared-directory concurrent writers.** Non-Git runs share the directory, and Git runs can opt out with isolateRuns=false **[Obs]**. Concurrent lane prompts against one directory appear to conflict with "parallel writers require isolated worktrees." Highest priority.
2. **Partial-launch semantics.** Sessions and worktrees are created in a loop and prompts are sent with Promise.all **[Obs]**. Check:
   - whether a mid-loop or send failure orphans worktrees;
   - whether retry duplicates lanes;
   - whether the UI surfaces the difference between created and started.
3. **Fusion source identity.** The dialog matches on parsed titles, while Compare uses metadata.multiRun identity **[Obs]**. Test repeated launches and renames for wrong-source selection.
4. **Council/Arena fallback.** When the slash command is unavailable, the compatibility fallback prompt may run without the runtime's policy, budget, preflight and member-error handling **[Inf]**. Users could believe they got a council review. Verify this, and label the fallback visibly.
5. **Model precedence.** Confirm that a lane's explicit provider/model is not overridden by the shared agent's model pin. The task path gives an explicit alias precedence; the MultiRun prompt path is **[Unk]**.
6. **Attention latency.** "Tree running" outranks a finished child's error **[Obs]**. Confirm the error surfaces in the root row once the tree goes idle, not only in the details view.

This is advisory input, not approval.
