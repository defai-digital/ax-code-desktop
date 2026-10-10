# Electron streaming hot-path improvement

## Problem and implementation plan

User feedback reports a slow GUI. Source review identified repeated directory-wide
part-map copying, history scans in session subscriptions, repeated derivation of
unchanged turns, and synchronous external-app launchers. Keep Electron and the
published AX Code SDK/runtime contracts. Implement and validate these changes:

1. Reduce consecutive deltas for one resolved directory into one immutable draft
   and one store publication. Full snapshots and non-delta events remain ordering
   barriers. Preserve overlap deduplication, missing-part recovery, routing, and
   per-event error isolation.
2. Attach ephemeral changed-message hints to part maps. Session subscriptions
   inspect those IDs instead of scanning their history on background deltas.
   Unhinted snapshots retain a reference-comparison fallback. Weak references
   prevent hints from retaining a chain of historical maps. Suspended part
   subscriptions still receive message-list changes.
3. Reuse unchanged turns before deriving summary, activity, diff statistics, and
   stream metadata. Changes to display policy or message order invalidate reuse.
4. Await external-app launcher child processes asynchronously. Keep candidate
   fallback behavior and error reporting. Windows discovery still contains
   synchronous probes; this change addresses the launcher wait on macOS, while
   retaining the existing Windows detached-launch path.

No product-boundary, ownership, signing, updater, or release-policy change is
part of this implementation. Markdown retains its existing incremental parser,
streaming semantics, deferred syntax highlighting, and virtualized history.

## Controlled measurements

Run the checked-in companion:

```sh
pnpm --dir desktop/packages/ui exec tsx src/sync/__tests__/streaming-hotpath.bench.ts
```

Local Node 26.5.0 / pnpm 10.33.4 results, median of five measured rounds after
one warm-up round. Each reducer round processes 20 batches of 20 deltas.
Sequential and batched paths run the same reducer in the current source.

| Cached message keys | Sequential ms per 20 deltas | Batched ms per 20 deltas |  Ratio |
| ------------------- | --------------------------: | -----------------------: | -----: |
| 200                 |                      0.0162 |                   0.0067 |  2.42x |
| 2,000               |                       5.944 |                    0.263 | 22.57x |
| 8,000               |                      27.001 |                    1.333 | 20.26x |

For 500 turns with ten historical text parts per reply, changing only the final
reply took 0.495 ms with full derivation versus 0.232 ms with previous-turn
reuse (2.14x). The benchmark checks final streamed text and equality of full
and incremental turn projections.

These are CPU microbenchmarks, not production workload observations or GUI
latency/FPS measurements. Single-stream batches may contain only one delta;
their copy cost will not shrink by the multi-session ratio. Store notifications,
React rendering, Markdown parsing, layout, and painting are excluded from these
timings. An 8,000-key cache is a stress scenario, not a measured user cache.

## Validation

- The first `pnpm run test` passed across all packages. After two additional
  regression cases, final package results are 61 script tests, 386 Electron
  tests, 1,590 UI tests, and 790 web tests passing (2,827 total, one web skip).
  The final root rerun encountered one unexpected 401 in the existing plugin
  deletion test. Its isolated 29-test file passed, and a complete web rerun
  passed all 99 files. The transient failure's cause is unconfirmed; no plugin
  route or test-fixture change is included.
- Regressions cover immutable snapshots, one notification per delta batch,
  snapshot ordering on cleanup, overlap deduplication, missing-part recovery,
  malformed-delta isolation, background-update scan avoidance, unhinted snapshot
  fallback, suspended subscriptions, display-policy invalidation, message-order
  changes, launcher fallback, and event-loop progress during an actual child
  process wait.
- `pnpm run typecheck`, `pnpm run lint`, `pnpm run check:boundaries` (including
  release contracts), `actionlint .github/workflows/*.yml`, and `git diff --check`
  passed. `pnpm run build` passed, including web production assets, Electron
  main/preload/server bundles, and the node-pty rebuild for Electron 42.5.2 on
  macOS arm64.

## Remaining verification

No running AX Coder GUI was available during the review. Before claiming an
end-user latency improvement, capture renderer CPU/React traces and input,
scrolling, long-task, and process-memory measurements for the same long-history
and multi-session workloads. Long-paragraph Markdown parsing and history
normalization/index reconstruction remain candidates if those traces show they
dominate after this change.
