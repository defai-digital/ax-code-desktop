# SPEC: Contract Authority, Proposals, and Dispatch

| Field   | Value                                                        |
| ------- | ------------------------------------------------------------ |
| Status  | Accepted design contract; implementation deferred to Phase 6 |
| Related | Active PRD; ADR-002; ADR-007                                 |

## 1. Contract revision

A contract revision is immutable and contains SHA-256 hashes plus repository-relative references for its PRD, ADRs,
specifications, implementation plan, and policy envelope. It records parent revision, author/agent provenance, creation
time, approval state, approver reference, and supersession relationship. Active work remains bound to its original
revision until an explicit transition is approved.

## 2. Authority

| Action                                                    | Default authority            |
| --------------------------------------------------------- | ---------------------------- |
| Observe and summarize owner evidence                      | Automatic                    |
| Draft a PRD, ADR, spec, plan, or task patch               | Agent proposal               |
| Accept or supersede an ADR                                | Human only                   |
| Change product scope, non-goals, or acceptance criteria   | Human only                   |
| Change security, data, public API, or release policy      | Human only                   |
| Dispatch an already approved bounded task                 | T2 policy or human           |
| Adjust low-risk execution detail inside frozen scope      | T3 policy                    |
| Expand permission, credentials, budget, merge, or release | Human or AX Trust grant only |

No agent approves its own authority expansion.

## 3. Proposal

A typed proposal carries decision and causation IDs, project, current contract revision, evidence hashes, proposed
action, patch or task envelope, authority tier, expected outputs, verification, budgets, risk, required approval,
idempotency key, expiry, and explicit no-op/pause/escalation alternatives.

Document proposals are written to isolated branches or proposal artifacts. They never silently edit an accepted
revision used by an active worker.

## 4. Dispatch

A dispatch binds the approved proposal to one AX Code task with project, worktree, objective, non-goals, constraints,
allowed paths, acceptance criteria, verification commands, model/sandbox/permission policy, time/token/step/retry caps,
expected evidence, and stable idempotency key. Parallel writers require separate worktrees; no merge is automatic.

## 5. Active-work revision change

When a successor contract appears, choose exactly one: let the worker finish the old revision, checkpoint and cancel
safely before rebasing remaining work, reject the successor, or request human reconciliation. Silent rebinding is
invalid.

## 6. Tests

Test approval actor and expiry, rejected/edited proposals, content-hash drift, duplicate approval events, duplicate
dispatch after restart, active-worker revision conflict, worktree lease fencing, budget expansion denial, and absence of
automatic merge/release effects.
