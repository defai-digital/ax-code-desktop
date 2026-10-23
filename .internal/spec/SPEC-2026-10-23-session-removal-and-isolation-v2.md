# Session removal and isolation v2

Status: implementation addendum for the user-authorized v7.28.6 candidate; publication remains subject to exact-source qualification.

This versioned record adds the immediate-archive behavior supplied in the user's integration changes. Earlier accepted specifications and historical S4.5 records remain unchanged.

## Removal

Deletion retains the seven-second local undo window. Archive requests are sent immediately after releasing the pending-removal event suppression flag. A seven-second toast offers a compensating unarchive. Undo waits for the archive acknowledgement, reverses successful IDs only, and consumes its action generation once. It must work even if an active snapshot arrives while the archive is in flight. An older toast cannot reverse a newer archive. A new removal waits for an in-flight unarchive acknowledgement. Failures retain existing notification and recovery paths; no additional real user conversations are deleted by release automation.

The generation expires seven seconds after commit completion, and expiry explicitly dismisses its toast even if the toast library paused its timer. A requested Undo remains valid throughout a slow bulk compensation. Focused archive interleaving tests replace the delayed-archive operations removed from the delete/recovery property model.

## Isolation

Reads and writes require an explicit nonblank directory. They do not use the shared temporary directory context. Writes to a normalized directory are ordered; unrelated directories proceed independently. The existing SDK transport deadline is 120 seconds, while the UI wait is 12 seconds. A UI deadline does not establish that a mutation failed on the server. The UI rereads immediately after the deadline and again when the late write settles. A refresh requested during another pending operation is coalesced and drained after that operation so a stale in-flight read cannot suppress the final refresh. This does not introduce server-side compare-and-set or change the runtime's isolation contract.

## File attribution

Runtime snapshot paths and Git status paths are worktree-relative, including status requested from nested directories. Relative names match exactly. Absolute summary paths require the canonical worktreeRoot supplied by Git status, and are compared against the root plus the exact status path. Missing roots do not authorize suffix guessing. Counts-only summaries retain the existing dirty-tree fallback. Symlink aliases not canonicalized by a producer can conservatively omit a follow-up; attribution does not mutate files or runtime state.

## Qualification

Both actual companion CLIs review the candidate, and claims are checked against source/tests. Required local gates, hosted CI/CodeQL, signed shadow inventory, native install/upgrade/rollback and continuity, upstream pins, and anonymous publication readback remain separate evidence. Desktop is 7.28.6; AX Code runtime 7.28.5 and SDK 2.6.46 remain paired and unchanged.
