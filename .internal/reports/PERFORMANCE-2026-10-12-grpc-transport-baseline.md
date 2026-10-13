# Desktop transport performance baseline

Date: 2026-10-12
Status: Implemented and locally validated; native transport migration remains unevaluated
Source baseline: `841a579b1dca77aa7d608dce20b0eced501808cd`
Environment: macOS arm64, Apple M3 Max, Node 26.5.0, SDK 2.6.7, configured runtime 7.24.4

## Plan and result

The transport review found an existing gRPC/native SDK contract, but its HTTP compatibility bridge
retains HTTP/SSE/WebSocket. The current Desktop event path is upstream SSE through the local server
to renderer WebSocket, with SSE fallback. A facade change alone is not a native transport speedup.

The implemented scope is a measurable baseline before choosing a transport migration:

1. Added opt-in, bounded, numeric renderer queue/callback diagnostics without event content.
2. Preserved event ordering, delta coalescing, batching, backpressure, and reconnect/resume behavior.
3. Added repeatable pinned-SDK codec and existing UI hot-path benchmark commands.
4. Added regression coverage and verified the collector through real Electron/WebSocket frames.
5. Ran full workspace validation before committing the scoped change.

No SDK/runtime pin, runtime owner, worker contract, distribution, or updater policy changes are included.
The user-facing diagnostic instructions and experiment criteria are in
`desktop/packages/ui/src/sync/PERFORMANCE.md`.

## Measurements

`pnpm run bench:sync-transport` checked that the installed SDK version matches the configured pin,
asserted round-trip equality, and used one warmup plus five measured rounds with alternating order.
The latest local medians were:

| Synthetic fixture | JSON bytes | Protobuf bytes | JSON encode/decode us | Existing Protobuf encode/decode us |
| ----------------- | ---------: | -------------: | --------------------: | ---------------------------------: |
| Text delta        |        158 |            148 |                 0.441 |                              9.726 |
| 100 sessions      |     12,991 |         15,086 |                41.367 |                          1,007.071 |

These are codec-only measurements. They exclude protocol framing, sockets, runtime handlers, model
execution, and rendering. The session fixture includes the logical `JsonResponse` wrapper in both codecs.
Dynamic `Struct`/`Value` encoding is not evidence about generated codecs for concrete typed schemas.
These values support measuring first, not a general claim that gRPC is slower.

`pnpm run bench:sync-hotpath` passed its correctness assertions. Existing batched state updates took
1.211 ms versus 25.088 ms sequentially for 20 deltas across an 8,000-message cache. Existing incremental
turn projection took 0.217 ms versus 0.456 ms for full projection across 500 turns. These compare existing
code paths and do not claim a new app speedup from this instrumentation change.

## Verification

- Focused pipeline/coalescing/resume/transport/measurement tests: 47 passed.
- Full `pnpm run test`: 3,113 passed, 7 existing skips, no failures.
  - Repository scripts: 137 passed, 6 skipped.
  - Electron: 476 passed.
  - UI: 1,704 passed.
  - Web server: 796 passed, 1 skipped.
- `pnpm run typecheck`: passed.
- `pnpm run lint`: passed.
- `pnpm run check:boundaries`, including release identity contract: passed.
- `pnpm run build`: all three tasks passed, including native module rebuild.
- Standalone benchmark TypeScript check, targeted Prettier check, and `git diff --check`: passed.

A temporary isolated Electron harness bundled the actual event pipeline, performance collector, and
WebSocket adapter. Only the SDK base-URL lookup was replaced with the fixture origin. A local WebSocket
server sent two 40-event bursts across five directories, with a backpressure frame between bursts.
Electron 44.7.0 / Chromium 152.0.7977.130 received all 80 text characters and recorded 80 received events,
10 dispatched events, 70 coalesced events, 10 batches, and 5 backpressure batches. It also verified that
diagnostics start disabled, snapshots contain no fixture content, and reset clears counters.
The local ignored evidence is `.tmp/sync-performance-smoke/result.json`.

This smoke proves the renderer measurement wiring over a real WebSocket. It does not run the signed
AX Code backend, perform LLM inference, or measure React commit/paint or user-visible end-to-end latency.
No native gRPC versus current-transport end-to-end comparison has been performed.
