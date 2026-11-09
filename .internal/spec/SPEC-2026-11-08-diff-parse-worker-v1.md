# Diff parse worker v1

Status: Scope authorized by the user on 2026-11-08 ("do option 1"). This record is a technical specification only.
It changes no package boundary, dependency, runtime pin or renderer permission, so it needs no PRD or ADR.
Related: ADR-018 (renderer security baseline); [WASM reassessment](../reports/WASM-2026-11-08-speed-and-stability-reassessment.md);
AX Code issue defai-digital/ax-code#506 (coarse result over the work limit).

## Problem

Desktop computes file diffs with Pierre `parseDiffFromFile`, which uses jsdiff, synchronously on the renderer thread.
The viewer, the hunk review list, review navigation and hunk revert share one cached parse (`diffHunkRevert.ts`).
On a cache miss, jsdiff is super-linear in edit distance. Measured medians on macOS arm64:

| Input | Parse |
| --- | ---: |
| 1k-line full rewrite | 66 ms |
| 2k-line full rewrite | 264 ms |
| 5k-line full rewrite | 1,685 ms |
| 10k-line full rewrite | 7,554 ms |

A 5k-line rewrite therefore freezes the window for about 1.7 s, and a 10k-line one for about 7.5 s. jsdiff gives no
way to bound or abort this work.

The canonical `@ax-code/diff-wasm` engine (v7.30.18) does not fix this case. It rejects every one of these inputs with
"Diff resource limit exceeded", so it is not adopted here. Issue #506 asks the owner for a coarse result instead.

## Behavior

1. **Off-thread parse.** A cache miss with more than `SYNC_PARSE_MAX_CHARACTERS` (16,384 UTF-16 code units, both
   sides combined) runs `parseDiffFromFile` in one dedicated module Worker. Smaller inputs keep the synchronous path,
   which costs at most a few milliseconds and avoids a loading flash.
2. **One shared result.** The existing bounded LRU cache, keyed by path and content hashes, stays the single source.
   Viewer, hunk list, review navigation and revert read the same entry. The worker result is a structured clone of
   plain `FileDiffMetadata` data. Consumers still treat entries as immutable.
3. **Deduplication and scheduling.** Concurrent requests for the same key share one job. Jobs run one at a time in
   request order. Pending input is bounded by `MAX_PENDING_CHARACTERS` (32,000,000 code units); requests beyond it
   fail with `busy` and are not cached, so a later mount retries.
4. **Cancellation.** Each request takes an `AbortSignal`. When every waiter on a queued job aborts, the job is
   dropped. When every waiter on the running job aborts, the Worker is terminated and recreated on demand.
5. **Timeout.** A job running longer than `PARSE_TIMEOUT_MS` (15,000 ms) terminates the Worker and fails with
   `too-large`. The key is remembered in a bounded set (`TOO_LARGE_LIMIT`, 64 keys), so remounting does not repeat
   the work. The viewer then shows the existing "too large to preview" state, and hunk actions are hidden.
6. **Worker failure.** A Worker error or malformed response fails the running job with `error`. That result is not
   cached. After `WORKER_FAILURE_LIMIT` (3) consecutive failures, or if the Worker cannot be constructed, the client
   falls back to the synchronous parse. That keeps today's behavior rather than leaving diffs blank, for example when
   a packaged build cannot load the Worker. Queued jobs then run one per task, yielding in between, so the window can
   paint and an abandoned job is dropped before it runs. A successful job resets the failure count.
7. **No stale paint.** The React hook keys its state by content key. A result is applied only if it belongs to the
   current original, modified and path. An error or timeout never reads as an empty diff: the hunk list and review
   navigation publish no anchors, and the viewer shows an explicit state. Returning to a key whose parse failed shows
   loading while it retries, not the earlier failure.
8. **Revert.** `revertHunk` stays synchronous and reads only the shared cache. Hunk rows exist only once the parse is
   ready, so the diff is already there. Waiting for a parse at click time would open a window in which the file can
   change on disk and the write would then be built from stale contents. If the diff is not ready, revert refuses and
   writes nothing. The write path, serialization and the one-revert-at-a-time guard are unchanged.

The Worker bundles only the Pierre parse entry point. It is same-origin, needs no CSP change, and receives no host
APIs.

## Acceptance

- Unit tests: the Worker entry answers with the same metadata as a direct parse, after a structured clone; concurrent requests share one job;
  abort drops a queued job and terminates a running one; timeout fails with `too-large` and is not retried; worker
  failure is not cached and falls back after the limit; inputs under the threshold never use the Worker.
- Component tests: the viewer, hunk list and review measure show loading, then the result; a stale result after a
  content change is discarded; timeout shows the too-large state without hunk rows.
- Root `check:boundaries`, `check:locales`, `typecheck`, `lint`, `test` and `build` pass. `build` proves the Worker
  bundles.
