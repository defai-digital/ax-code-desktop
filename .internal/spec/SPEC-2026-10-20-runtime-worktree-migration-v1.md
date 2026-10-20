# Runtime worktree migration v1

Status: Accepted for implementation on 2026-10-20.
Decision: ADR-020. Producer: AX Code ADR-260, shipped in runtime 7.27.7 and in the pinned SDK 2.6.39.

## 1. Goal

Desktop stops creating, removing and registering worktrees itself. The runtime does it through the published SDK
(`worktree.create`, `worktree.remove`). Desktop keeps the interactive version-control steps ADR-020 allows: fetching a
remote ref, adding a fork remote, and setting an upstream.

## 2. Create (`POST /api/git/worktrees`)

The route keeps its request and response shapes. `createWorktree` in `web/server/lib/git/service.js` becomes:

1. Validate input exactly as today (`rejectOptionLikeValue`, `cleanBranchName`, `normalizeStartRef`).
2. Desktop-owned VCS preparation in the primary checkout, unchanged: `ensureRemoteWithUrl` and `fetchRemoteBranchRef`
   when the request names a remote ref or `ensureRemote*`.
3. Map to one runtime call, `client.worktree.create({ directory, worktreeCreateInput })`:
   - `mode: "new"` → `{ name, branch: preferredBranchName || omitted, startRef: startRef unless "HEAD" }`;
   - `mode: "existing"`, local branch → `{ name, existingBranch }`;
   - `mode: "existing"`, remote ref (`origin/x`) → `{ name, branch: <resolved local branch>, startRef: "<remote>/<branch>" }`
     (a new branch AX Code owns);
   - `startCommand` passes through; a per-request `operationId` (random) is sent so a transport retry is idempotent.
4. After success: set the upstream with `git branch --set-upstream-to` in the new worktree when requested or inferred,
   exactly as the old bootstrap did.
5. Response: `{ head, name, branch, path }` from the runtime `Worktree` (`directory` → `path`) plus `git rev-parse HEAD`
   in that directory (empty string while the runtime is still populating it).

Removed from Desktop: `git worktree add`, `resolveCandidateDirectory` for creation, `syncProjectSandboxAdd`, and
Desktop's own start-script bootstrap (`queueWorktreeBootstrap`, `runWorktreeStartScripts`). The runtime runs the
project start command and `startCommand`.

## 3. Bootstrap status (`GET /api/git/worktrees/bootstrap-status`)

Keep the endpoint and its `{ status: "pending" | "ready" | "failed", error, updatedAt }` contract. Status becomes a
projection of the runtime's `worktree.ready` and `worktree.failed` events for that directory, taken from the event
stream the web server already consumes from the runtime. Set `pending` when create returns. Unknown directories keep
answering `ready`, as today.

## 4. Remove

`removeWorktree` calls `client.worktree.remove({ directory, worktreeRemoveInput: { directory } })`. The runtime deletes
only branches it owns (ADR-260). Desktop no longer runs `git worktree remove`, `git branch -D` or
`syncProjectSandboxRemove`. If the old Desktop API offered "delete branch" for a branch the runtime will keep, Desktop
reports that the branch was kept instead of deleting it.

## 5. Unchanged

Listing (`getWorktrees`), validation and preview keep working; preview reports the branch name, not a guessed path,
when the runtime chooses the location. Reset stays as it is unless it already calls git directly for worktree reset; if
so, route it to `client.worktree.reset` and surface the runtime's refusal for branches it does not own.

## 6. Tests

Mapping table for the three create modes, operation ID sent, upstream set after create, runtime error surfaced, remove
through the SDK, bootstrap status from ready and failed events, and create/remove calling no `git worktree add`, `git worktree remove` or
`git branch -D` (asserted by recording the git invocations, not by reading source). The source-text ratchet must not
grow.

## 7. Implementation notes (2026-10-20, `da761404`)

- **Keeping a branch on remove.** The runtime deletes every branch it created when it removes the worktree. When the user
  does not ask to delete the branch, Desktop first writes the ADR-260 borrowed mark
  (`branch.<name>.axCodeBorrowed = <name>`, a user-initiated version-control step under ADR-020), so unmerged work
  survives. A runtime `keepBranch` remove option would make this explicit; until then the mark is the contract.
- **Preview** returns the name and branch with an empty `path`; the runtime chooses the location. The UI uses `path`
  only when present.
- **Upstream** is set right after create returns instead of inside a background bootstrap; a failure is a warning, as
  before.
- **Conflict checks** at create time are the runtime's (its error message is returned); `validateWorktreeCreate` keeps
  the Desktop-side pre-checks for the dialog.
- Worktrees created by older Desktop builds live under the same data root, still list through `git worktree list`, and
  are removed by the runtime; their `openchamber/<name>` branches are not runtime-owned, so they are kept and reported.
- **Release review fixes (7.27.4).** A failed `git worktree list` stops the removal ("nothing was removed") instead of
  letting the runtime delete a branch the user meant to keep. When the user explicitly asks to delete the local branch
  and the runtime kept it (borrowed, or kept earlier), Desktop deletes it with `git branch -D -- <name>`, a
  user-initiated step under ADR-020, restoring the pre-migration behavior.
