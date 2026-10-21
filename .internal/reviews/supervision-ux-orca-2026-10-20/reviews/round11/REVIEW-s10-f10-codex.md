# Round 11 S10 and F10 review (codex, read-only)

- **P1 — Unreviewed changes can be staged as reviewed.** [ReviewLanding.tsx:73](/Users/akiralam/code/ax-code-desktop/desktop/packages/ui/src/components/views/git/ReviewLanding.tsx:73) checks only the final worktree bytes. For Last turn, if the index contains A, an earlier turn produced B, and the reviewed turn shows B→C, matching C permits whole-file staging of A→C—including the earlier, unreviewed changes. The fresh-status check only establishes stability since rendering. Bind the reviewed `before` state to the index, or stage only the reviewed patch.

- **P1 — Blob equality does not prove file type or mode.** [ReviewLanding.tsx:76](/Users/akiralam/code/ax-code-desktop/desktop/packages/ui/src/components/views/git/ReviewLanding.tsx:76) accepts a symlink whose link text equals the reviewed regular file’s `after` text. The server hashes symlinks by link text, so replacing regular file contents `target` with a symlink to `target` passes this guard and stages an unseen type change. Executable-bit changes likewise escape the content check. Include type/mode identity in the review contract or reject unsupported changes.

- **P2 — Abandoned queued retries remain indefinitely.** [remoteActivityCache.ts:182](/Users/akiralam/code/ax-code-desktop/desktop/packages/ui/src/lib/supervision/remoteActivityCache.ts:182) adds IDs to `forced`, but removal occurs only when their fetch starts. If both slots are occupied and the retried row disappears before a slot opens, neither consumer updates, disposal, nor cache eviction removes that ID. Repeated cycles can grow this module-lifetime set without bound. Prune retry intent when demand disappears and clear it when all consumers dispose.

Read-only in-memory checks reproduced these guard and cleanup failures. They also confirmed rejection of UTF-16, stripped-BOM and normalized-CRLF mismatches, and preservation of the two-request limit. No additional keyboard activation issue was found in the grid handler. No files were modified.
## Dispositions

- P1 unreviewed changes staged as reviewed: fixed. A session file counts as reviewed only when the index still holds the
  reviewed `before` (an addition: untracked) and the worktree holds the reviewed `after`, so staging applies exactly the reviewed
  change. Earlier turns' or a person's changes in the same file make it unreviewed (the "Stage all N" confirmation remains).
  Test case `earlier-turn.ts`; mutation probe killed.
- P1 type and mode: fixed. Git status now reports `indexMode` and `worktreeMode` (symlinks are 120000; on Windows the
  executable bit follows the index, as git does with core.filemode false). The worktree mode must equal the index mode, and a
  new file must be 100644. Server test for an executable bit and a symlink swap with equal bytes; client cases `swapped.ts`,
  `executable.ts`, `created-executable.sh`; mutation probes killed. A separate status-column check was removed as redundant
  with the mode check (its probe survived).
- P2 abandoned retries: fixed. Retry applies only to a session a board shows; intents for rows that leave every board are
  dropped on update, and all are cleared when the last board unmounts. Test "a Retry waiting for a free slot is dropped when
  its row leaves the board"; mutation probe killed.
