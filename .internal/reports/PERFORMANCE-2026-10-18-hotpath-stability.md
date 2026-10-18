# Hot-path stability and performance

Date: 2026-10-18. Baseline: `0ab190dab446b6c150b2a171a6f6e382f9960559`.
Integration base: `f0025707de744e78fc15248e4f33315427c15a40`.

## Implementation

- Preserve removal/archive barriers when coalescing events. Merge deltas only when both offsets are absent or both are valid, contiguous nonnegative integers. Golden traces compare legal text events with the published SDK projection.
- Index delta keys by part instead of scanning every queued key for each snapshot. Normal delivery yields after 128 events or an 8 ms callback budget. Pending work at the 512-event high-water mark drains synchronously without dropping approvals or lifecycle events. Cleanup, reentrant delivery, and delta batching retain ordering.
- Retain completed materialization start times through the cooldown, separately from active write claims. Expired entries are pruned and completed history is capped at 4,096 entries.
- Return only the changed Markdown block suffix when the client acknowledges the same owner and response revision. Reuse requires the parser's unchanged block identities; rewrites, reference changes, owner changes, and finalization use a complete response. Finalization still performs a full parse.
- Isolate worker faults to the active job. Later jobs use a new worker; three consecutive faults trigger a 15-second recovery cooldown. Deferred consumers subscribe to capacity changes, allowing unchanged completed messages to retry. Retention includes the active input, is limited to 4 million UTF-16 code units and 16 pending owners, and keeps only one response cache. Individual bodies over 1 million code units remain plain text.
- Reuse display history for an ordinary assistant tail update and derive only changed turns when IDs, roles, parents, and ordering are unchanged. Duplicate IDs, structural edits, compaction context changes, and adjacent shell/task bridges use full projection. Source identities are still checked in O(N); the change avoids repeated grouping and index allocation.

The work remains within Desktop's existing React/Electron presentation and sync adapters. Heavy parsing stays in a worker, following [Electron's main-thread guidance](https://www.electronjs.org/docs/latest/tutorial/performance). Yielding and bounded callbacks follow the [long-task guidance](https://web.dev/articles/optimize-long-tasks). The suffix protocol specifically reduces [worker structured-clone work](https://developer.mozilla.org/en-US/docs/Web/API/Worker/postMessage).

## Reviewer involvement

Muse CLI and Grok CLI completed the initial focused reviews. Muse identified removal ordering, mixed offsets, cooldown loss, and the possible quadratic snapshot scan; regression tests reproduced the first three, and a CPU profile identified the scan. Grok identified permanent worker disablement, sticky capacity rejection, repeated AST copying, and full-history grouping before reuse.

Grok completed a subsequent implementation-plan review. Muse's planning attempt returned subscription quota exhaustion (HTTP 429). One broad and two focused Grok implementation-review attempts each reached the 240-second limit without a final response. They are **not** implementation approval. [Receipts](hotpath-2026-10-18/review-receipts.json) distinguish completed reviews from failed attempts.

Reviewer suggestions were verified rather than accepted wholesale: failed jobs are not retried automatically, final Markdown uses a full parse, and deferred capacity is tracked by mounted consumers rather than evicting another owner's queued work.

## Measurements

The following medians are controlled Node CPU measurements on macOS arm64, Node 26.12.0, with pnpm 10.33.4. Other builds/tests were running on the host. They are not production latency, frame-rate improvements, or cross-platform qualification. The snapshot callback only collects events and the transport is mocked; both the secondary index and the bounded drain contribute to the difference.

| Workload                                 |        Baseline |   Candidate |
| ---------------------------------------- | --------------: | ----------: |
| 2,000 distinct part snapshots            |       164.95 ms |     1.24 ms |
| 4,000 distinct part snapshots            |       468.10 ms |     2.56 ms |
| 8,000 distinct part snapshots            |     1,824.63 ms |     3.37 ms |
| One content update across 500 turns      |        0.407 ms |    0.032 ms |
| One content update across 2,000 turns    |        2.546 ms |    0.303 ms |
| Display normalization across 2,000 turns |        0.517 ms |    0.016 ms |
| 64,113-character Markdown response JSON  | 1,727,471 bytes | 1,830 bytes |

Snapshot samples use three runs at each size. History samples use five measured runs after warmup, each with 50 distinct immutable tail updates. The Markdown comparison appends a new paragraph to a stable block-rich body; the full response contains 1,492 blocks and the suffix contains two. JSON size and Node `structuredClone` timings are transfer-cost proxies. The initial request and finalization still transfer full content.

[Raw numerical samples](hotpath-2026-10-18/measurements.json) retain the method limitations. Run `pnpm run bench:sync-hotpath` for the committed reducer/projection/display/Markdown microbenchmark; its full-versus-incremental comparisons are not a replay of the older commit.

## Electron smoke

The existing controlled renderer harness was adapted locally to the current `PartMap` and worker admission API. It mounted the production MessageList, ChatInput, store selectors, and Markdown worker in Electron 44.9.0 / Chromium 152.0.7977.167 using the packaged `app://ax-code` protocol and CSP. It used a temporary profile, inert runtime providers, intercepted fetches, and synthetic text; no runtime or model request was sent.

Both 4,000-message scenarios completed approximately 12 seconds of requested 20 Hz updates with no captured renderer errors or worker failures. Ordinary Markdown completed 72 worker requests and retained all 79 delivered input characters. The long open paragraph completed 104 of 239 requests, coalescing obsolete pending versions, and retained all 78 delivered input characters. The history remained virtualized to seven mounted entries. Formatting and the input were visually inspected.

The long paragraph still had a 33.3 ms p95 frame gap and two gaps above 50 ms, despite no observed long tasks. A large unstable paragraph still requires substantial parsing and DOM work. This is a functional smoke and a remaining-work observation, not a paired renderer speedup claim. The smoke preceded the final teardown/batch-drain follow-ups and integration of the separate supervision commit; final source is covered by the validation recorded below. [Renderer observations](hotpath-2026-10-18/renderer-summary.json).

## Limits and follow-up

The 8 ms slice is a cooperative target, not a hard deadline: an individual callback cannot be preempted, and cleanup/reconnect/high-water drains are synchronous. The SDK SSE adapter already yields during replay, but transport hooks do not offer awaitable capacity. A future sustained-overload change should add transport-level backpressure or authoritative resynchronization rather than discard lifecycle/approval events.

The high-water bound concerns undispatched events per directory, not arbitrary snapshot byte size or total network buffers. Markdown still sends the full input string to its worker. Further work should profile long open paragraphs and main-thread DOM cost with real sessions before changing renderer architecture or adding more caches.

## Validation

The final integrated candidate passed `pnpm run test` (5,457 passed; 10 existing skips), `pnpm run typecheck`, `pnpm run lint`, `pnpm run build`, and `pnpm run check:boundaries` including release contracts. [Validation receipts and source hashes](hotpath-2026-10-18/validation.json) bind these checks to the implementation files. Dependency pins, signing, updater policy, and release identity are outside this change. No publication or installation is part of this work.
