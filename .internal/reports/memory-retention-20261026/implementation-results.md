# Memory retention implementation and verification

## Implemented behavior

The three reproduced retention defects are addressed in Desktop source. No canonical runtime history is deleted or truncated.

- Managed directory stores now share a scheduled session-content policy across live events, fetched history, materialization and reconnect snapshots. Writes coalesce into a one-second sweep; a 30-second provider sweep handles idle expiry without new events. The existing 40-session policy is enforced for all content writers. Each directory also targets 20 MiB of estimated content and keeps the latest 150 messages of settled, unviewed conversations. Unprotected content expires after 20 minutes without access.
- Viewed conversations and explicitly paged history, external window presence, running/incomplete turns, unresolved permissions/questions and outstanding read/send leases are protected. These are intentional soft-budget exceptions. Directory eviction respects running/pending work. Settled optimistic shadow entries do not permanently pin completed conversations.
- Eviction and history trimming clear dependent pagination/prefetch metadata and projection/routing snapshots. Reopening fetches canonical history and restores working pagination. Unique claims prevent old loads, archive/delete races and disposed directories from restoring discarded content. Windows aliases share ownership/cache identity.
- Git actions share a directory retention boundary: up to 10 snapshots and 20 MiB estimated payload, with lazy 20-minute idle expiry. The active project is protected. Existing inactive diff release remains. Eviction/removal invalidates request ownership, and list-request metadata is released after settlement. A stale log/branch/status/diff response cannot become a replacement directory's current response.
- Snippets use a combined, count/size-bounded snapshot cache (10 projects, 20 MiB) and unique in-flight ownership. Oversized snapshots are available to the current view but are not retained as hidden project cache entries. Registry removal releases matching Git/snippets caches.
- The Debug Panel displays the actual sync session cap and its Log State action reports aggregate retained sessions/messages/parts, estimated bytes, protected sessions and eviction/trim counts. Estimates are payload diagnostics, not RSS or a full V8/native allocation accounting.
- Directory/provider teardown removes observers, timers, cached load state and routing registrations. StrictMode's immediate effect replay preserves the live manager.

## Regression evidence

The archived initial investigation reproduced 200 retained background sessions, 100 retained Git directories and stale snippets for 50 projects. The new Git and snippets budget regressions were also run against detached baseline `48055c8d`: both failed on their intended behavioral assertions (100 directories versus a limit of 10; evicted snippets still present). See `before-regressions.txt`. Those tests pass on the implementation.

New tests cover live events and direct snapshot writers, the background history window and pagination recovery, byte budgets (including optimistic parts without session IDs), protected work/views/loads, idle expiry, settled optimistic shadows, lease release/replacement, directory/provider teardown, late responses, project removal and Windows alias identity. Existing reconnect teardown tests now exercise full provider disposal while automatic eviction refuses to discard protected running work.

## Native renderer experiment

The same fixture and native WebMCP journey run in separate unpackaged Electron builds: detached baseline `48055c8d` and the implementation. A verified live-event warm-up sends 200 distinct sessions, followed by five batches of 200 completed sessions each. Each carries a 32,768-character text body plus a short fixture prefix. The primary fixture conversation is explicitly opened to align the active directory, and an edit approval is armed and must survive the test. Synthetic session snapshot reads are completed with empty fixture responses through CDP interception; the real project transcripts and permission APIs remain unintercepted. Checkpoints use two explicit garbage collections before sampling renderer heap and DOM counters. This is a short controlled experiment on macOS ARM64 / Electron 44.9.1, not a signed-release install or production soak.

The baseline retains 201 message-bearing sessions after warm-up (200 synthetic sessions plus the visible fixture), increasing to 401, 601, 801, 1,001 and 1,201. The fixed renderer retains 40 sessions after each batch: the visible approval-bearing conversation plus 39 background sessions. Final post-GC renderer heap checkpoints (MiB, warm-up then five batches):

| Revision | Warm-up | Batch 1 | Batch 2 | Batch 3 | Batch 4 | Batch 5 |
| --- | ---: | ---: | ---: | ---: | ---: | ---: |
| Before | 60.23 | 67.02 | 73.93 | 80.83 | 87.55 | 94.59 |
| After | 55.27 | 55.75 | 57.25 | 56.26 | 57.68 | 56.97 |

See `before-checkpoints.json`, `after-checkpoints.json`, `native-summary.json` and `after-renderer.png`.
The final fixed checkpoint reports 41 messages and 41 part-bearing messages, 2,598,166 estimated payload bytes,
1 protected session and 1,161 evicted sessions. The native journey independently confirms the Allow once control remains
available after all batches. Both revisions complete 1,200 intercepted synthetic recovery reads. A second fixed run also passes (`repeat-native.json`).
This measures substantially reduced retained growth under this fixture, not a production speedup or a promise of constant total process memory.

Harness development failures are preserved in `fixture-attempts.json`, not counted as passing evidence. They exposed three fixture issues:
reading a different active-directory store than the event target (aggregate diagnostics showed content still retained), synthetic recovery requests
encountering HTTP retries/rate limits, and portfolio fixtures intentionally disabling their default approval. The final journey explicitly opens the
fixture conversation, arms an existing edit request and intercepts only synthetic transcript recovery requests. It verifies the live ingestion barrier
before sampling. Real transcript fetching/reopening and permission retention are covered by the separate project-switch journey and regressions.
Successful final runs report no uncaught renderer exceptions and pass CSP checks.

Grok CLI and AX Code GLM were attempted as bounded read-only advisory reviewers. The first Grok pass exhausted its turn limit; GLM and a tool-free Grok packet review timed out without actionable final findings. They provide no independent approval evidence. Source review, regressions, required gates and native observations are the verification basis.

## Limits

Protected/viewed working sets can exceed content budgets, and a user can intentionally load substantial visible history. Total application memory includes Electron main/GPU/native allocations, the Desktop server and canonical runtime, which this renderer experiment does not qualify. No claim is made that every historical GUI release leaked, that all possible leaks are fixed, or that production MB/hour improved by a particular percentage. The measured defect paths are fixed and repeated fixture content no longer accumulates in the renderer cache.

## Final gates and delivery

All six required root gates completed successfully in the prescribed order: `check:boundaries`, `check:locales`,
`typecheck`, `lint`, `test`, `build`. Exit codes and timings are in `gates.json`. The final full suite passed
8,228 tests (247 root scripts, 1,192 Electron, 5,264 UI, 1,525 Web), with 10 existing skips. The final native
memory journey passed against that build, including fresh WebMCP state, part budgets, approval preservation,
heap/DOM checkpoints, screenshot, CSP and uncaught-exception checks. The final journey file also passed a
focused Electron ESLint invocation after its additional approval/part assertions.

The final native project-switch journey also passed: a conversation opens, switching to another project clears
foreign selection and stops cross-directory transcript reads, and both projects' conversations can be reopened.
Its fixture receipt is `project-switch-receipt.json`. The isolated baseline worktree was removed after retaining
the investigation receipts. The implementation and this evidence are delivered together in the scoped commit. No push, publication, installation or deployment is part of this task.
