# PRD: AX Coder Product and AX Code Desktop Extraction

| Field             | Value                                                                                                                               |
| ----------------- | ----------------------------------------------------------------------------------------------------------------------------------- |
| Status            | Accepted; Phases 0-2 complete, Phase 3 pending                                                                                      |
| Created           | 2026-09-02                                                                                                                          |
| Owner             | AX Coder product, AX Code Desktop, and AX Agent runtime owners                                                                      |
| Target repository | `~/code/ax-coder`                                                                                                                   |
| Source repository | `~/code/ax-code`                                                                                                                    |
| Scope             | Product boundary, history-preserving Desktop extraction, persistent multi-project supervision, and bounded project-manager autonomy |
| Related           | AX Code ADR-055, ADR-063, Desktop P0 hardening records; AX Agent ADR-001 and migration plan                                         |

## 0. Authorization and current state

This PRD records the requested product direction and implementation plan. The user accepted implementation by
explicitly directing work to continue on 2026-09-02. It does not by itself authorize a
destructive source move, deletion from AX Code, public repository creation, remote push, package publication,
release, application-identity change, signing-key change, or updater cutover.

The SDK publication recorded below was performed under the user's explicit JSR selection and subsequent direction to
continue the remaining implementation. It did not publish a Desktop artifact or change Desktop release ownership.

At the accepted Phase 0 baseline:

- `~/code/ax-coder` is a new local Git repository containing governance records only.
- AX Code Desktop production source remains under `~/code/ax-code/desktop/`.
- AX Code commit `1c3eb8cbfa1160c35ec3dbc8d05561b4df248d8c` is the clean source baseline. It includes the previously
  committed Desktop package-integrity change, the independently verified JSR SDK publication implementation,
  and the public Desktop contract exports.
- The filesystem `desktop/` tree contains ignored dependencies and build output. Migration must operate from
  tracked Git history plus an explicit, reviewed transfer of any approved outstanding changes. A recursive
  filesystem copy is forbidden.
- AX Agent is a local-first v0.2 scaffold. Its durable store, loop, local policy, approvals, CLI, and daemon are
  implemented, but AX Code characterization, coding capability extraction, workflow parity, and later
  integration milestones are not complete. AX Coder must not treat planned AX Agent capabilities as shipped.

Implementation began after the required ADR and specification gates in section 16 were satisfied.

Current implementation state:

- Phase 0 governance, specifications, baseline, and producer verification are complete.
- Phase 1 imported the filtered Desktop history at AX Coder merge
  `a1d62422f150cb775875e58f22db171b91e9d0be`; its exact evidence is under
  `.internal/reports/extraction/`.
- AX Code Desktop production source remains present at the source baseline, and Desktop source removal is not
  authorized. AX Code main later advanced to `3bb0822ddf305cb5fda11fb9eb668f4bc14d8600` for the corrected JSR workflow
  invocation and its required generated model snapshot.
- Phase 2 independent workspace and public-contract consumption completed on 2026-09-02 at AX Coder implementation
  commit `e0d0d69f0d3d4628ede504cdbfa3e3065320bbb9`.
- AX Code tag `sdk-v2.2.0` fixes SDK producer commit `1c3eb8cbfa1160c35ec3dbc8d05561b4df248d8c`.
  GitHub Actions run `33696640828` published `@defai-digital/ax-code-sdk@2.2.0` through OIDC.
- The production lockfile and sibling-free clean-clone verification passed every Phase 2 install, boundary, typecheck,
  lint, test, build, package, runtime-integrity, ASAR, and packaged-smoke gate.
- Phase 3 independent CI and release shadow is pending. No public Desktop release, updater cutover, source deletion, or
  portfolio autonomy has occurred.

## 1. Executive summary

AX Code is an effective task-oriented coding runtime. A user asks it to perform work; autonomous and goal modes
allow the runtime to continue until the task completes, blocks, pauses, or exhausts a budget. The remaining
operator problem appears above one session and one repository: a human must monitor multiple terminals, inspect
each project's status, decide what should happen next, reconcile planning artifacts, and restart or redirect
workers.

AX Coder will be a persistent desktop product for exception-driven supervision of multiple human-added coding
projects. It will separate desired project state from observed execution state, use deterministic event-driven
reconciliation, invoke a scoped project-manager agent only when judgment is required, and dispatch bounded goal
contracts to AX Code workers. Humans will review exceptions, product and architecture changes, permission or
budget expansion, merge, release, and final go/no-go decisions.

The existing AX Code Desktop GUI will move from the AX Code monorepo into the AX Coder repository through a
history-preserving, behavior-preserving extraction. The source move and the AX Coder product evolution are two
separate migrations: first establish independent ownership without user-visible regressions; then add the
portfolio and project-manager experience incrementally.

AX Coder is an experience and product-control plane. It must not become a second AX Code or AX Agent runtime.

## 2. Problem statement

### 2.1 Human supervision does not scale across projects

AX Code currently composes several effective per-session or per-project primitives:

- autonomous execution with hard limits and completion gates;
- `/goal` with a frozen plan contract, budgets, and verification evidence;
- `TaskQueue` for durable detached work;
- scheduled tasks with atomic claims, overlap prevention, backoff, and recovery;
- workflows, subagents, worktrees, and candidate comparison;
- TUI, headless, HTTP, SDK, and Desktop clients over the same coding runtime.

After a task or goal reaches a terminal or waiting state, a human still decides the next project-level action.
With several repositories, that human becomes a polling and integration loop across terminals. Important states
such as blocked permission, failed verification, budget exhaustion, plan drift, stale work, and merge-ready
results are fragmented across sessions and projects.

### 2.2 AX Code Desktop has the wrong source and product boundary for the new role

AX Code Desktop currently lives in the AX Code monorepo and releases on a lockstep runtime train. Its shipped
hardening work intentionally made it a thin integration layer around one AX Code runtime contract, but its
source, CI, packaging, updater, documentation, and release workflows remain coupled to the AX Code repository.

The requested AX Coder product has a distinct lifecycle:

- it must remain useful while supervising several project runtimes;
- its local service must outlive a window and reconcile after restart;
- it owns a cross-project desired-state and exception-review experience;
- it needs independent UI release cadence without forking worker semantics;
- it will eventually consume AX Agent for durable manager runs and AX Code as the coding capability.

Keeping this product inside AX Code would reopen the accepted boundary that AX Code is a coding runtime rather
than a general Agent OS. Copying the Desktop source into a second repository without removing the old owner
would create a permanent fork. A governed one-way source move is required.

### 2.3 A fixed model polling loop would be unsafe

A model wake every ten minutes is 144 wakes per project per day, including periods when nothing changed. It can
observe half-complete worker state, replan against partial evidence, duplicate dispatch after restart, create
provider thundering herds, and oscillate with workers that are still executing the prior plan.

The ten-minute interval may remain as a deterministic reconciliation safety net. It must not be the primary
model clock. Meaningful events and desired-state drift decide when a model is needed.

## 3. Product vision

A human adds the repositories they care about, selects an automation tier, approves project contracts, assigns
priorities and budgets, and then works from one exception inbox. AX Coder continuously projects what each
project is doing, what evidence exists, what is blocked, and which decisions require a person. Within an
approved contract, AX Coder may dispatch AX Code workers and continue verified work without asking the human to
watch terminals.

The target operating model is:

```text
Human product and architecture owner
               |
               | approved outcomes, constraints, priority, budgets
               v
AX Coder desktop + persistent portfolio service
               |
               | deterministic desired-vs-observed reconciliation
               v
Scoped project-manager run (AX Agent target owner)
               |
               | versioned proposal or approved dispatch contract
               v
AX Code worker: goal, tools, worktree, tests, evidence
```

AX Coder should feel like an AI software organization whose operators manage outcomes and exceptions, not an
unbounded collection of agents that silently rewrite goals.

## 4. Goals

### 4.1 Product goals

| ID  | Goal                                                                                                                                                                    |
| --- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| G1  | Give a human one durable view of status, activity, budgets, evidence, and exceptions across explicitly added coding projects.                                           |
| G2  | Move AX Code Desktop source ownership to the AX Coder repository without losing history, licensing, update continuity, user data, platform support, tests, or rollback. |
| G3  | Keep AX Code as the sole coding worker and runtime contract; retain its CLI, TUI, headless, HTTP, SDK, and integration surfaces.                                        |
| G4  | Run AX Coder's local portfolio service independently of the Desktop window lifecycle and recover cleanly after restart.                                                 |
| G5  | Use event-driven desired-state reconciliation with deterministic timers, leases, deduplication, budgets, and stop rules.                                                |
| G6  | Allow project-manager agents to draft and, within an approved authority tier, dispatch versioned work without silent contract drift.                                    |
| G7  | Replace multi-terminal polling with an exception inbox for blocked work, approvals, failed verification, budget pressure, plan changes, and merge-ready results.        |
| G8  | Preserve a migration path to AX Agent as the canonical durable manager runtime instead of growing a second implementation in AX Coder.                                  |

### 4.2 Engineering goals

| ID  | Goal                                                                                                                      |
| --- | ------------------------------------------------------------------------------------------------------------------------- |
| E1  | Establish independent AX Coder CI, packaging, smoke, updater, signing, and release ownership.                             |
| E2  | Consume AX Code through published, versioned contracts and signed runtime artifacts rather than workspace source imports. |
| E3  | Keep cross-project desired state and UI projections separate from authoritative AX Code and AX Agent execution records.   |
| E4  | Make every dispatch, plan revision, approval, and reconciliation decision attributable and idempotent.                    |
| E5  | Permit parallel read and evaluation work while serializing writes or isolating writers in Git worktrees.                  |
| E6  | Verify each extraction and product slice independently with an explicit rollback point.                                   |

## 5. Non-goals

- Redefining AX Code as TUI-only or removing its headless, server, SDK, ACP, CI, or integration roles.
- Copying or independently evolving AX Code sessions, providers, tools, permissions, scheduler, workflow engine,
  or task ledger in AX Coder.
- Copying or independently evolving AX Agent's domain-neutral durable run, tool lifecycle, workflow, approval,
  lease, or recovery semantics.
- Building AX Trust, credential brokering, immutable audit, AX Telemetry, AX Serving, or AX Engine inside AX
  Coder.
- Auto-merging candidate branches, auto-releasing products, expanding permissions, changing credentials, or
  increasing budgets without explicit policy and approval.
- Shipping computer use or `ax-computer` as part of this source move.
- Building a distributed, multi-tenant, remote-worker control plane in the first product release.
- Rebranding legacy package identifiers, application bundle identifiers, data directories, release channels,
  or compatibility environment variables during the source extraction unless a dedicated ADR authorizes it.
- Deleting AX Code Desktop source before independent build, smoke, release, update, rollback, and parity gates
  pass.
- Treating a planning document or UI projection as proof that a runtime capability exists.

## 6. Users and jobs to be done

### 6.1 Multi-project maintainer

When several repositories have active coding work, the maintainer wants one view of progress and exceptions so
they can prioritize decisions rather than inspect terminals.

### 6.2 Product and architecture owner

When an agent proposes scope, acceptance, architecture, data, permission, or release changes, the owner wants a
reviewable revision with evidence and impact before it becomes effective.

### 6.3 Engineering operator

When a worker blocks, fails verification, stalls, loses its runtime, or exhausts a budget, the operator wants a
durable explanation and safe next actions without duplicate execution.

### 6.4 AX product maintainer

When AX Code, AX Agent, and AX Coder evolve independently, the maintainer wants versioned contracts and
compatibility gates so one product does not require source-level coupling to another.

## 7. Ownership and source-of-truth model

| Capability                                                                        | Canonical owner                                      | AX Coder behavior                                                        |
| --------------------------------------------------------------------------------- | ---------------------------------------------------- | ------------------------------------------------------------------------ |
| Portfolio project registry, priority, desired state, automation tier              | AX Coder                                             | Authoritative product state                                              |
| Portfolio exception inbox and decision proposals                                  | AX Coder                                             | Authoritative product state with durable references                      |
| Manager run, lifecycle, waits, approvals, workflows, leases, recovery             | AX Agent target                                      | Consume via versioned API or temporary compatibility adapter             |
| Coding session, goal contract, repository tools, verification, worktree execution | AX Code                                              | Dispatch and observe through public contract                             |
| AX Code task and workflow execution state                                         | AX Code today; AX Agent after an accepted extraction | Read-only projection; never duplicate as a writable ledger               |
| Product and architecture contracts in a repository                                | The repository and its human-approved revision       | Draft revisions and reference content hashes                             |
| Policy, credential, grant, enterprise approval, immutable audit                   | AX Trust                                             | Store opaque decision and grant references only                          |
| Model execution and admission                                                     | AX Engine and AX Serving                             | Submit bounded workload intent through the owning runtime                |
| Platform observability                                                            | AX Telemetry                                         | Display local health without claiming the platform observability surface |

AX Coder may keep a disposable observed-state projection for responsive UI and reconciliation. A projection is
never authority for whether an AX Code or AX Agent run executed.

## 8. Product architecture

### 8.1 Experience plane

The Desktop application provides:

- human-added project registry;
- project health and current work overview;
- active, queued, blocked, completed, failed, and stale work views;
- exception and approval inbox;
- plan, contract, evidence, branch, diff, and verification review;
- automation-tier, budget, priority, and stop controls;
- existing AX Code Desktop chat, terminal, file, diff, Git, settings, and session surfaces during the migration.

### 8.2 Persistent portfolio service

The local service owns product-specific desired state and projections. Closing or reloading the Desktop window
must not corrupt or silently abandon its reconciliation state. The service must:

- default to loopback-only access;
- authenticate privileged commands;
- persist before acknowledging externally visible decisions;
- drain or checkpoint before controlled restart;
- reconcile leases and incomplete decisions after crash;
- subscribe to versioned AX Code and AX Agent events with cursor resume;
- use a deterministic reconciliation timer as a safety net;
- invoke a model only when a state transition or invariant requires judgment.

The source-extraction ADR must decide whether this service is an Electron utility process, a separately managed
local daemon, or an AX Agent service client. It must not become a duplicate web/runtime proxy of the kind removed
by AX Code Desktop hardening.

### 8.3 Deterministic reconciler

For each project, reconciliation compares an approved desired state with observed, content-addressed evidence.
It produces one of a bounded set of outcomes:

```text
no_op
wait_for_worker
refresh_projection
dispatch_approved_task
request_manager_decision
request_human_decision
pause_project
mark_project_complete
```

The reconciler owns clocks, leases, idempotency, budgets, cooldowns, and stop rules. A model does not enforce
those invariants.

The nominal ten-minute sweep performs bounded status and cursor checks. It does not read full repositories or
invoke a model when nothing changed. Primary wakes are event-driven:

- worker or workflow terminal transition;
- verification failure or missing evidence;
- blocked permission or question;
- budget warning or exhaustion;
- lease loss, runtime restart, or stale progress;
- human requirement, priority, policy, or contract revision;
- CI, review, or repository event configured by the user.

### 8.4 Project-manager agent

One scoped manager lease may be active per project. The manager reads a bounded project snapshot and returns a
typed proposal, never an unstructured command stream. A proposal includes:

- decision ID and causation event IDs;
- project and approved contract revision;
- observed evidence and content hashes;
- proposed action and authority tier;
- proposed document patch or worker task contract;
- expected outputs and verification;
- token, time, concurrency, and retry budget;
- risk and required approval;
- stable idempotency key;
- explicit no-op, pause, blocked, and escalation alternatives.

The manager cannot approve its own authority expansion. Manager-generated events must not immediately wake the
same manager unless observed worker or human state changes; this prevents self-triggered feedback loops.

### 8.5 AX Code worker

AX Coder dispatches work to AX Code, not to a TUI process. The TUI and Desktop are clients; AX Code's headless or
service contract is the execution boundary.

Every worker task must bind to:

- project and workspace/worktree identity;
- immutable contract revision;
- unique task and dispatch IDs;
- objective, non-goals, constraints, and allowed paths;
- acceptance criteria and verification plan;
- model, sandbox, permission, token, time, step, and concurrency policy;
- expected artifact and evidence envelope;
- idempotency and retry classification.

Parallel exploration may share a read-only source. Parallel writers require independent Git worktrees or a
serialized mutation lane. Nothing merges automatically.

## 9. Automation and document authority

### 9.1 Automation tiers

Each project starts at the lowest tier and may be raised only by a human or policy owner.

| Tier | Name             | Allowed behavior                                                                                             |
| ---- | ---------------- | ------------------------------------------------------------------------------------------------------------ |
| T0   | Observe          | Read status and evidence; never propose or dispatch                                                          |
| T1   | Propose          | Draft decisions, document patches, and task contracts for human review                                       |
| T2   | Execute approved | Dispatch and continue tasks already covered by an approved contract and budget                               |
| T3   | Bounded autonomy | Adjust execution detail and dispatch low-risk work within frozen scope, budgets, permissions, and stop rules |

No tier authorizes silent product-scope changes, accepted architecture changes, permission expansion, budget
increase, merge, release, credential handling, or destructive recovery.

### 9.2 Artifact authority matrix

| Artifact or action                                                               | Default authority                                                             |
| -------------------------------------------------------------------------------- | ----------------------------------------------------------------------------- |
| Status, evidence references, timestamps, and checklist completion                | Automatic when derived from committed events and verification                 |
| Task breakdown and ordering within an accepted scope                             | New versioned proposal; may auto-apply at T3 if no active task is invalidated |
| Implementation plan detail                                                       | Versioned proposal; policy may auto-approve bounded low-risk changes          |
| New PRD or technical specification                                               | Agent may create a draft; human acceptance required                           |
| PRD goals, non-goals, scope, or acceptance criteria                              | Human acceptance required                                                     |
| ADR creation                                                                     | Agent may draft                                                               |
| ADR acceptance or supersession                                                   | Human decision required; never rewrite history silently                       |
| Data migration, security boundary, package ownership, public API, release policy | Human acceptance required                                                     |
| Permission, credential, budget, merge, release, or destructive action            | Explicit human or AX Trust approval required                                  |

### 9.3 Contract revisions

An approved project contract is an immutable revision identified by content hashes for its PRD, ADRs,
specifications, implementation plan, and policy envelope. Every dispatch references that revision.

A manager may propose a successor revision but cannot mutate the revision used by an active worker. Adoption of
a successor must choose one explicit outcome:

- allow the current worker to finish against the old revision;
- pause or cancel at a safe checkpoint and rebase remaining work;
- reject the successor;
- require human reconciliation.

This extends AX Code goal mode's existing frozen-plan digest behavior to project scale.

## 10. Portfolio data model

The technical spec will lock schemas. The minimum concepts are:

| Concept             | Purpose                                                                                                   |
| ------------------- | --------------------------------------------------------------------------------------------------------- |
| ProjectRegistration | Human-added project identity, local path or approved endpoint, default branch, runtime profile            |
| ProjectDesiredState | Priority, automation tier, active contract revision, outcome, budgets, deadlines, concurrency policy      |
| ContractRevision    | Immutable hashes and references for PRD, ADR, spec, plan, and policy inputs                               |
| ProjectObservation  | Cursor-based projection of worker, Git, CI, verification, and runtime evidence                            |
| ManagerDecision     | Typed no-op, proposal, dispatch, pause, completion, or escalation with causation and model provenance     |
| Dispatch            | Stable mapping from manager decision to AX Code or AX Agent run/task identifiers                          |
| Exception           | Durable human decision item with severity, expiry, required actor, and resolution                         |
| Lease               | Fenced ownership of project-manager or mutation responsibility                                            |
| BudgetLedger        | Deterministic per-project and portfolio counters and caps; no raw provider credentials or prompt payloads |

Large transcripts, tool outputs, repository files, and screenshots remain in their owning artifact systems. AX
Coder stores references, hashes, bounded summaries, and redaction metadata.

## 11. Safety, reliability, and control requirements

### 11.1 Idempotency and delivery

- Every manager wake, proposal, approval, and dispatch has a stable ID.
- A worker dispatch deduplication key includes project, contract revision, and task identity.
- At-least-once event delivery must not cause duplicate task creation or duplicate external effects.
- State transitions are persisted before success is acknowledged.
- Restart recovery reconciles unknown outcomes before retrying non-idempotent work.

### 11.2 Leases and concurrent work

- One live project-manager lease per project, with expiry, heartbeat, and fencing token.
- One mutation lease per repository worktree.
- Lost or stale owners cannot commit later transitions.
- Parallel work is read-only unless writers have separate worktrees and explicit merge policy.
- A project may configure a lower concurrency ceiling than the portfolio ceiling.

### 11.3 Budgets and stop conditions

Budgets are deterministic and include model calls, tokens, wall time, steps, retries, active workers, and
concurrent writers. The product must warn before exhaustion and fail closed at the cap.

Automatic pause and human escalation occur on at least:

- budget exhaustion;
- repeated verification failure;
- repeated blocked outcomes;
- repeated manager proposals with no material state change;
- contract drift or digest mismatch;
- lease contention or stale owner;
- unknown side-effect outcome;
- expired approval;
- project path, identity, or trust change;
- runtime compatibility failure;
- user stop or global emergency stop.

### 11.4 Feedback-loop protection

- No replan while a worker is active unless a failure, block, budget, policy, or human-change event requires it.
- Manager decisions carry causation IDs and do not self-wake on their own projections.
- Identical decisions within a cooldown window are deduplicated.
- Replan depth, wakes per project per day, and consecutive no-op model calls are capped.
- Persistent failure auto-pauses rather than retrying forever.

### 11.5 Security and credentials

- Loopback-only is the local default.
- The renderer never receives runtime credentials when a privileged host boundary can inject them.
- AX Coder stores credential references, never raw secrets in its portfolio database.
- External project paths and endpoints are explicitly added and validated.
- Project configuration is trust-scoped; opening a repository does not grant authority to its instructions.
- Tool policy, sandbox, and elevated execution grants remain separate controls.
- Logs, metrics, exports, and notifications use bounded redacted fields.

## 12. Desktop source extraction

### 12.1 Source scope

The migration starts from tracked Git content, not the live filesystem tree. Candidate source ownership includes:

- `desktop/**`, including Electron, web, UI, docs, scripts, licenses, notices, changelog, and tests;
- Desktop-only workflows currently under `.github/workflows/`;
- Desktop boundary, release, version, packaging, and documentation scripts currently under root `script/`;
- Desktop-owned root package, workspace, Turbo, catalog, patch, and lockfile fragments;
- AX Code Desktop public docs and release links that must move or redirect;
- compatibility code such as `ax-code webui` that may remain in AX Code as a client launcher rather than move.

The extraction specification must classify every candidate as `move`, `remain`, `duplicate temporarily`,
`generate`, or `delete after cutover`, with an owner, consumer, compatibility window, and test.

AX Code runtime, SDK source, provider catalogs, coding tools, session store, and native coding addons do not move.
AX Coder consumes released packages and signed runtime artifacts. Development may use an explicit local override,
but production cannot depend on sibling source paths.

### 12.2 History preservation

The source move must preserve meaningful file history and attribution. The approved extraction procedure must:

1. record the exact clean source commit and all relevant outstanding user changes;
2. run only in a disposable clone or temporary directory, never rewrite `~/code/ax-code` history;
3. filter tracked Desktop and approved support paths from Git history;
4. retain license, notice, authorship, changelog, and commit-message provenance;
5. produce a source-to-target commit mapping when hashes change;
6. merge filtered history into AX Coder without replacing its governance records;
7. transfer approved post-baseline changes as explicit commits or reviewed patches;
8. compare tracked file manifests and content hashes;
9. exclude ignored dependencies, caches, build output, secrets, and local data;
10. record exact commands, versions, commits, and verification output.

A simple recursive copy is not acceptable.

### 12.3 Behavior-preserving first move

The first independent AX Coder build preserves behavior and compatibility before adding portfolio autonomy:

- existing Desktop features and security boundaries;
- current OS targets;
- application bundle identity, protocol handlers, data paths, Keychain/TCC continuity, and updater behavior;
- legacy `openchamber` and `opencode` compatibility identifiers where still load-bearing;
- the `ax-code-desktop` command or a documented compatibility shim;
- AX Code runtime and SDK version compatibility;
- release signatures, notarization, Authenticode policy, minisign verification, and smoke gates;
- user settings, projects, sessions, terminal, Git, notifications, and scheduled-task migration behavior.

Repository name, source ownership, and public product name are separate decisions. Rebranding and data-identity
migration require a later ADR and must not be bundled into the source extraction.

### 12.4 Independent dependency contract

AX Coder must stop using AX Code workspace imports as a production dependency. The target dependency flow is:

```text
AX Coder -> exact @defai-digital/ax-code-sdk version from JSR
AX Coder -> pinned signed AX Code runtime artifact
AX Code   -> no source dependency on AX Coder
```

The SDK and runtime compatibility policy must define supported version ranges, capability negotiation, failure
messages, local development overrides, and release ordering. AX Coder must fail clearly when the worker contract
is incompatible; it must not silently fall back to copied runtime logic.

### 12.5 Source removal from AX Code

Deletion from AX Code is the final extraction action, not the first. It occurs only after:

- AX Coder independently installs, builds, typechecks, lints, tests, packages, signs, and smokes;
- current user changes are present in the target and verified;
- a released or internal-candidate AX Coder artifact passes upgrade and rollback tests;
- AX Code integration commands point to the new product contract or are deliberately retired;
- Homebrew, GitHub Releases, updater metadata, public docs, issue routing, and security reporting have a tested
  owner;
- AX Code CI and release pass without Desktop workspace packages or scripts;
- a rollback release can restore the prior working Desktop;
- maintainers approve the cross-repository commit pair.

The AX Code removal commit must be focused, preserve compatibility shims with explicit expiry, update its
AGENTS.md and public docs, and reference the corresponding AX Coder commit and contract version.

## 13. Release, update, identity, and data continuity

### 13.1 Release migration

The release cutover is staged:

1. AX Coder builds unsigned local artifacts from the extracted history.
2. AX Coder CI produces non-public candidate artifacts with the same runtime version and full smoke suite.
3. Signing, notarization, minisign, updater metadata, and artifact audits run in shadow mode.
4. An upgrade test moves an installed AX Code Desktop build to the AX Coder-owned candidate without losing
   settings, projects, sessions, credentials, TCC/Keychain access, or rollback ability.
5. The public release owner changes only after shadow evidence passes.
6. AX Code release workflows stop creating Desktop artifacts only after the first AX Coder-owned release is
   verified.

### 13.2 Identity

Source extraction does not automatically change:

- display name;
- executable or package names;
- macOS bundle ID;
- Windows application/user-model identity;
- Linux package ID;
- deep-link scheme;
- data, cache, log, and settings paths;
- Keychain or credential-service names;
- signing identities or public verification keys;
- updater channel and repository.

Any identity change needs an explicit data and credential migration, compatibility period, downgrade behavior,
and user communication plan.

### 13.3 Rollback

Before source removal, rollback means selecting the last AX Code-owned Desktop release. After source removal,
rollback means publishing or reinstalling the last verified compatible artifact while preserving the shared
runtime and data contracts. Rollback must never rewrite or discard user data silently.

If a new schema cannot safely downgrade, the product must freeze the affected state read-only and explain the
recovery path rather than attempt a lossy migration.

## 14. Implementation phases

### Phase 0: Governance and baseline

Status: Complete on 2026-09-02.

- Accept this PRD.
- Create cross-repository ADRs and the specifications listed in section 16.
- Record AX Code, AX Agent, and AX Coder commits and dirty states.
- Complete provenance, license, package, dependency, path, CI, release, and user-data inventories.
- Capture the current Desktop verification baseline, including the pending packaged-app manual smoke.
- Resolve or explicitly transfer all overlapping uncommitted Desktop work.

Exit: approved ownership and migration contracts; reproducible clean baseline; no source copied yet.

### Phase 1: History-preserving extraction

Status: Complete on 2026-09-02 at merge `a1d62422f150cb775875e58f22db171b91e9d0be`.

- Build a disposable filtered-history candidate.
- Preserve `desktop/**` paths initially to minimize behavior changes; layout flattening is a later decision.
- Import governance records without replacing extracted history.
- Transfer approved changes after the baseline as focused commits.
- Verify tracked manifests, license/notice content, and representative file history.

Exit: AX Coder contains the complete reviewed source history and no ignored artifacts; AX Code remains unchanged.

### Phase 2: Independent workspace and contracts

Status: Complete on 2026-09-02 at implementation commit `e0d0d69f0d3d4628ede504cdbfa3e3065320bbb9`.

- Create AX Coder root package, workspace, catalog, Turbo, formatting, test, and structure configuration.
- Move or reimplement Desktop-owned root scripts and contract checks.
- Replace AX Code workspace SDK imports with versioned package consumption.
- Stage a pinned signed AX Code runtime artifact with explicit local-development override.
- Establish contract fixtures shared through released artifacts rather than sibling source.

Exit: install, typecheck, lint, test, build, and package succeed without an AX Code sibling checkout.

### Phase 3: Independent CI and release shadow

Status: Pending.

- Port Desktop CI, CodeQL, packaging, signing, update metadata, smoke, and artifact audit workflows.
- Produce platform candidate artifacts without public publication.
- Run clean-machine install, packaged smoke, sleep/resume, restart, terminal, settings, scheduler, and runtime
  compatibility tests.
- Exercise upgrade and rollback from the last AX Code-owned release.

Exit: release evidence is equivalent to or stronger than the source repository baseline.

### Phase 4: Release and source-ownership cutover

- Move public release, security reporting, Homebrew, updater, documentation, and issue-routing ownership.
- Publish the first AX Coder-owned compatibility release.
- Verify real update and rollback behavior.
- Remove Desktop production source, workspace entries, CI, and release scripts from AX Code in a paired change.
- Retain only intentional AX Code client launchers and contract fixtures.

Exit: one production Desktop source owner; AX Code core and release gates are green; no duplicate release path.

### Phase 5: Portfolio read-only product slice

- Add the human-managed project registry.
- Subscribe to AX Code runtime and task events with cursor resume.
- Build a normalized cross-project projection and factory view.
- Add exception inbox for blocked, failed, stale, budget-limited, and merge-ready work.
- Add global pause and per-project stop without manager-agent decisions.

Exit: users can replace multi-terminal status polling without granting new write authority.

### Phase 6: Proposal-only project manager

- Add bounded project snapshots and typed manager decisions.
- Draft PRD, ADR, specification, plan, and task-contract patches in isolated branches or proposal artifacts.
- Require human approval for every dispatch and contract change.
- Add project leases, decision deduplication, budget counters, cooldowns, and feedback-loop protection.

Exit: one and then several projects complete proposal/approval/dispatch cycles with zero duplicate work and no
unapproved contract mutation.

### Phase 7: Execute-approved automation

- Enable T2 automation for human-approved task contracts.
- Automatically continue only when verification and evidence gates pass.
- Pause and escalate on drift, repeated failures, unknown side effects, budget pressure, or policy questions.
- Integrate AX Agent only against implemented, versioned, tested capabilities; remove any temporary manager-run
  compatibility owner when AX Agent becomes canonical.

Exit: bounded unattended operation reduces human interventions without increasing unsafe decisions.

### Phase 8: Bounded portfolio autonomy

- Permit T3 execution-plan adjustments inside frozen product and architecture scope.
- Add optional cross-project prioritization proposals and portfolio budgets.
- Keep priority and total-budget changes human-approved.
- Evaluate distributed or remote operation only through a separate PRD and ADR.

Exit: measured reliability, cost, and decision-quality gates justify the AI software-organization claim.

## 15. Acceptance criteria

| ID    | Acceptance criterion                                                                                                                               |
| ----- | -------------------------------------------------------------------------------------------------------------------------------------------------- |
| AC-01 | AX Coder builds and tests from a clean checkout without an AX Code source checkout.                                                                |
| AC-02 | The extracted source has a reviewed Git history mapping, license/notice preservation, and tracked-file hash report.                                |
| AC-03 | No ignored dependencies, build output, local data, or credentials are imported from the AX Code worktree.                                          |
| AC-04 | All approved Desktop changes present at the extraction baseline are represented by reviewed target commits.                                        |
| AC-05 | AX Coder consumes an exact `@defai-digital/ax-code-sdk` version from JSR and a pinned signed AX Code runtime; no copied coding runtime is present. |
| AC-06 | Existing Desktop typecheck, lint, tests, boundary checks, build, package, and platform smoke gates pass independently.                             |
| AC-07 | Upgrade and rollback preserve settings, projects, sessions, credentials, application identity, and supported OS behavior.                          |
| AC-08 | AX Code passes its core, SDK, structure, install, and release gates after Desktop source removal.                                                  |
| AC-09 | A user can add several projects and see active, queued, blocked, failed, completed, stale, and budget state in one view.                           |
| AC-10 | The exception inbox durably represents permissions, questions, verification failures, plan changes, budget events, and merge-ready results.        |
| AC-11 | The ten-minute sweep performs no model call when event cursors and desired state are unchanged.                                                    |
| AC-12 | Event replay, reconciliation, and restart tests produce zero duplicate manager decisions and zero duplicate worker dispatches.                     |
| AC-13 | Every dispatch references an immutable contract revision, acceptance criteria, verification plan, budgets, and idempotency key.                    |
| AC-14 | Active workers cannot be silently switched to a changed PRD, ADR, spec, or plan revision.                                                          |
| AC-15 | PRD and spec changes require configured approval; ADR acceptance/supersession always requires a human decision.                                    |
| AC-16 | Parallel writers use isolated worktrees or deterministic serialization; no automatic merge occurs.                                                 |
| AC-17 | Budget exhaustion, repeated failure, plan drift, stale leases, and unknown side effects pause and escalate rather than loop forever.               |
| AC-18 | Raw credentials are absent from portfolio state, prompts, events, logs, metrics, exports, and fixtures.                                            |
| AC-19 | AX Coder can globally pause dispatch while leaving evidence and rollback paths inspectable.                                                        |
| AC-20 | Public documentation identifies one current source, one release owner, and clear AX Coder/AX Code/AX Agent boundaries.                             |

## 16. Required decisions and specifications

Before source extraction, create and accept:

### AX Coder ADRs

1. Product and source boundary: AX Coder, AX Code, AX Agent, AX Trust, and user authority.
2. History-preserving Desktop extraction and one-way source ownership.
3. Runtime and SDK dependency, compatibility, and release-train policy.
4. Persistent portfolio service process model and canonical data ownership.
5. Application identity, updater, signing, and public release ownership.

### AX Code ADR

An AX Code ADR must explicitly supersede or narrow the source-location, release, and Desktop ownership portions
of ADR-063 while preserving the runtime, event, state, security, and sidecar contracts still consumed by AX
Coder. It must also reconcile ADR-055's coding-runtime-not-Agent-OS boundary.

### AX Agent decision

Record which implemented AX Agent contract, if any, can own project-manager runs. Planned capabilities are not
accepted dependencies. Temporary compatibility ownership must have a removal milestone and must never execute
the same run in two engines.

### Technical specifications

1. Source-path inventory, history-filter procedure, provenance manifest, and dirty-change transfer.
2. Independent workspace, dependencies, package names, patches, and build/test commands.
3. AX Code worker API, events, capability negotiation, and compatibility policy.
4. Portfolio store, projections, cursors, leases, idempotency, reconciliation, and recovery.
5. Contract revision, document authority, approvals, dispatch, worktree, and evidence schema.
6. Desktop process model, local authentication, renderer boundary, and persistent-service lifecycle.
7. Packaging, signing, notarization, update metadata, release migration, and rollback.
8. User-data, settings, credentials, TCC/Keychain, bundle identity, and downgrade migration.

## 17. Verification plan

### 17.1 Source and repository verification

- clean-clone reproducibility;
- tracked manifest and content-hash comparison;
- representative `git log --follow` history checks;
- license, notice, generated-source, and dependency provenance audit;
- secret scan over imported history and current tree;
- no sibling-path or workspace-source dependency check.

### 17.2 Desktop parity verification

- typecheck, lint, tests, boundary checks, SDK contract checks, and build;
- packaged smoke on macOS, Windows x64/ARM64, and supported Linux targets;
- terminal, Git, project, session, provider, settings, notification, updater, and scheduler flows;
- sleep/resume, runtime restart, web service restart, exhausted supervisor, and incompatible runtime behavior;
- signing, notarization, minisign, artifact manifest, and update metadata audits.

### 17.3 Supervisor correctness verification

- event replay from cursor and gap-triggered resync;
- deterministic no-op sweep with zero model calls;
- duplicate event and concurrent reconciliation races;
- project lease expiry and fencing;
- crash before and after persisted decision and dispatch;
- stable dispatch deduplication across restart;
- active-worker contract revision drift;
- model no-op, repeated proposal, and feedback-loop caps;
- budget warnings, exhaustion, global pause, and auto-pause;
- worktree isolation and serial-write enforcement;
- approval expiry, rejection, edit, and actor validation.

### 17.4 Cross-repository verification

Record exact compatible commits and versions for AX Coder, AX Code, and AX Agent. Contract fixtures must run in
producer and consumer CI. No milestone is complete based only on mocks or documents.

## 18. Success metrics

### Operator outcomes

- Time spent polling terminals decreases materially in multi-project dogfood.
- Most human interactions originate from a bounded exception inbox.
- Median blocked/failure detection is event latency, not the ten-minute sweep interval.
- Human decisions contain sufficient evidence without opening the worker terminal in routine cases.

### Reliability and safety

- Duplicate worker dispatches across event replay, race, and restart: zero.
- Unapproved accepted-contract mutations: zero.
- Automatic merges and releases: zero.
- Lost acknowledged decisions or exceptions after controlled restart: zero.
- Raw credential findings in stored or exported product state: zero.
- Active workers silently changed to a different contract revision: zero.

### Product quality

- Independent Desktop release gates are at least as strong as the AX Code source baseline.
- Upgrade and rollback success across the repository cutover meet the platform release matrix.
- False manager wakes and repeated no-op model calls remain within the configured cap.
- Verified goal completion rate improves without increasing reverted or unsafe changes.

## 19. Risks and mitigations

| Risk                                                 | Impact                                          | Mitigation                                                                                                                        |
| ---------------------------------------------------- | ----------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------- |
| Uncommitted Desktop work is lost or partially copied | User work loss and divergent products           | Block extraction; record dirty state; transfer only through explicit reviewed commits or patches; never stash/reset automatically |
| Filesystem copy imports 1 GB of ignored artifacts    | Bloated repo, secrets, non-reproducible build   | Filter tracked Git history in a disposable clone; compare manifests; scan imported history                                        |
| New repo forks AX Code runtime behavior              | Security and correctness divergence             | Public SDK/API and signed sidecar only; dependency checks; no runtime source import                                               |
| AX Agent plans are treated as implementation         | Missing recovery and workflow guarantees        | Capability audit and contract tests; temporary adapter with expiry; no claims without evidence                                    |
| Source move combines rebrand and identity migration  | Broken updater, TCC, credentials, and user data | Behavior-preserving source move first; dedicated identity ADR later                                                               |
| New release owner breaks upgrades                    | Stranded installed base                         | Shadow artifacts, real upgrade/rollback tests, delayed public cutover                                                             |
| Model polling creates cost and plan churn            | Waste, rate limits, oscillation                 | Event wakes, deterministic no-op sweep, hysteresis, cooldowns, caps                                                               |
| Manager and worker rewrite the same plan             | Contract drift and invalid work                 | Immutable contract revisions, leases, active-run binding, explicit rebase                                                         |
| Parallel agents edit one worktree                    | Lost or conflicting changes                     | Read-only parallelism, worktree isolation, serialized mutation lanes                                                              |
| Manager expands scope or authority                   | Unsafe autonomous product decisions             | Tiered authority, human/Trust approval, fail-closed policy                                                                        |
| Portfolio database becomes a second task ledger      | Conflicting execution truth                     | Store desired state and references; execution records remain with owners                                                          |
| Cross-repo changes cannot land atomically            | Broken intermediate states                      | Additive contracts first, consumer update second, source removal last, paired commit ledger                                       |

## 20. Rollout and rollback

Every phase is feature-gated and independently reversible. Rollout advances through:

1. local developer builds;
2. internal read-only dogfood;
3. proposal-only dogfood;
4. signed candidate release with existing Desktop behavior;
5. source-ownership cutover;
6. execute-approved automation;
7. bounded autonomy.

Kill criteria include any duplicate dispatch, credential leak, data loss, updater break, contract drift, unsafe
permission expansion, unreviewed merge/release, or inability to restore the last verified Desktop release.

Global pause must stop new dispatch immediately, request cancellation where safe, preserve current evidence, and
leave projects inspectable. Rollback never erases already-observed external side effects; it stops subsequent
work and reconciles them.

## 21. Open decisions

- Public display name and whether `AX Coder` remains the final product name.
- GitHub organization/repository remote and issue/security-reporting ownership.
- License declaration and treatment of Apache-2.0, MIT-derived, generated, and third-party Desktop portions.
- Initial source layout and whether `desktop/**` is preserved beyond the extraction release.
- Published package names and compatibility lifetime for `ax-code-desktop`, `@ax-code/electron`, and legacy
  `@openchamber/ui` or `openchamber` identifiers.
- Application bundle/package identity and whether it changes in a later branding release.
- Public tag and updater-channel naming after the release owner changes.
- Exact AX Code SDK/runtime compatibility window and release ordering.
- Whether the persistent portfolio service is a separate daemon or an Electron-supervised leaf process.
- Which AX Agent milestone and contract can own manager runs, approvals, workflows, and recovery.
- Portfolio storage location, backup, retention, export, and migration policy.
- Default automation tier, budgets, reconciliation interval, staleness SLA, failure threshold, and wake caps.
- CI and external event adapters included in the first product release.

## 22. Definition of done

This program is complete only when:

1. AX Coder is the sole production source and release owner for the Desktop application.
2. AX Code contains no Desktop production implementation or duplicate release path, only intentional clients
   and versioned contracts.
3. Existing users can update, retain data and credentials, use supported platforms, and roll back safely.
4. AX Coder consumes AX Code and AX Agent through versioned contracts without duplicating either runtime.
5. Multiple human-added projects can be observed and controlled from one exception-driven interface.
6. Deterministic event reconciliation survives restart without duplicate decisions or dispatches.
7. Project-manager autonomy is tiered, budgeted, lease-protected, evidence-backed, and plan-revision safe.
8. Product, architecture, permission, budget, merge, and release authority remains with the configured human or
   governance owner.
9. Verification records exact cross-repository commits, versions, commands, platform results, and rollback
   evidence.
10. Public documentation and product claims match implemented behavior.
