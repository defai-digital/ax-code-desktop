# ADR-020: Desktop git operation scope

Status: Accepted on 2026-10-19. Implementation of the migration waits for the paired AX Code decision.
PRD: PRD-2026-10-19-competitive-quality-v1 (Phase 2, item 8). Producer proposal:
`proposals/AX-CODE-ADR-PROPOSAL-2026-10-19-stable-worktree-api.md`.

## Context

ADR-002 gives worktree execution to the AX Code runtime. Desktop's web server nevertheless creates and removes worktrees
itself (`web/server/lib/git/service.js` runs `git worktree add --no-checkout`, existing-branch checkout, start refs and
bootstrap start scripts) because the runtime's public worktree API (`/experimental/worktree`, SDK 2.6.37) accepts only
`name` and `startCommand`. The runtime also creates worktrees for agents (AX Code ADR-240, ADR-243), so two
implementations decide branch names, locations and cleanup.

## Decision

1. **Desktop may keep:** read-only repository inspection (status, diff, log, branches, remotes), and user-initiated
   working-copy operations in the user's own checkout (stage, unstage, commit, restore, push, pull, branch switch, PR
   helpers). These are interactive version-control UI.
2. **Runtime-owned:** creating, resetting and removing worktrees, choosing their location and branch, and running
   bootstrap scripts. Desktop asks for these through the SDK.
3. **Freeze:** no new worktree execution paths are added to `web/server/lib/git/`. Fixes to the existing path are allowed
   until migration.
4. **Migration:** after AX Code publishes a stable worktree API (existing branch, start ref, bootstrap status, operation
   ID and idempotency) in a released runtime and SDK, Desktop pins that SDK and routes worktree creation and removal
   through it, keeping the existing UI. The old service path is then deleted.

## Consequences

The boundary violation is recorded and contained instead of silently growing. Release order follows ADR-004: runtime and
SDK first, then the Desktop pin. Until then, users keep today's behavior.
