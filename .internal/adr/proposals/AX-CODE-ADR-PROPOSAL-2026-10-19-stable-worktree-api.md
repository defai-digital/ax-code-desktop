# AX Code ADR proposal: stable worktree API for clients

Status: Proposal to the AX Code runtime repository. Not an accepted AX Code decision.
Requested by: AX Code Desktop ADR-020 (2026-10-19).

## Problem

`POST /experimental/worktree` (SDK 2.6.37 `WorktreeCreateInput`) accepts only `name` and `startCommand`. Desktop needs
to create a worktree from an existing branch or a chosen start ref and to observe bootstrap progress, so it runs git
itself, duplicating runtime ownership (ADR-002) and the agent worktree tools (ADR-240, ADR-243).

## Proposed decision

1. Promote the route to a stable, versioned path (for example `/worktree`) and keep `/experimental/worktree` as an alias
   for one minor version.
2. `WorktreeCreateInput` gains: `branch` (create new) or `existingBranch` (check out), `startRef`, `bootstrap`
   (`"none" | "project" | "custom"` with `startCommand`), and a client `operationId` for idempotency.
3. Creation returns `{ worktree, operationId, bootstrap: { status, logRef } }`; bootstrap status is observable through an
   event (`worktree.bootstrap.updated`) and a `GET` by operation ID.
4. `remove` and `reset` accept `operationId` and report whether the branch was deleted.
5. Validation reuses `CreateReadyInput.startPoint` rules from ADR-243.

## Release order

Runtime release and SDK publication first, then Desktop pins the exact SDK and runtime (Desktop ADR-004).
