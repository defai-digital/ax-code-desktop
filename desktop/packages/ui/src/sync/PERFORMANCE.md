# Local sync performance diagnostics

The Desktop currently uses HTTP API calls and WS-first/SSE-fallback renderer events. The AX Code
SDK's gRPC-shaped HTTP bridge retains HTTP/SSE/WebSocket underneath. Switching to that facade
does not establish a native HTTP/2 speedup. Measure the relevant stage before changing transport.

## Plan and implementation

1. Keep existing transport, ordering, delta coalescing, reconnect/resume, and batching behavior.
2. Add optional renderer queue/callback measurements with bounded numeric samples and no event content.
3. Make the pinned SDK codec comparison and existing state-processing benchmark reproducible.
4. Verify disabled overhead, coalescing, callback failures, reconnect flushes, and backpressure.
5. Consider a native transport experiment only after profiling attributes material latency or CPU to transport.

## Capture a renderer session

In the renderer DevTools console, enable diagnostics and reload:

```js
localStorage.setItem("ax-code:sync:performance", "1")
location.reload()
```

After streaming work in one or more projects:

```js
window.axCodeSyncPerformance.snapshot()
window.axCodeSyncPerformance.reset()
```

Disable and reload:

```js
localStorage.removeItem("ax-code:sync:performance")
location.reload()
```

Diagnostics are off by default. They are separate from content-bearing sync debug logs, do not
send network requests, and retain no prompts, event payloads, paths, identifiers, or credentials.
Each enabled renderer owns a shared recorder. At most 512 numeric batch samples are retained for
each of `all`, `ws`, `sse`, and `mixed`. Counters accumulate since reset; nearest-rank p50/p95/max
describe the retained recent samples. `mixed` means the same queue received both WS and SSE events
before flushing. Reset clears completed measurements; already queued events can enter the next sample.

The sample unit is one directory flush batch, not an event. `receivedEvents` counts accepted events
before coalescing; `dispatchedEvents` counts events offered to callbacks after coalescing, including
events in a delta batch and failed callbacks. `failedCallbacks` counts callback invocations that threw.
`backpressureBatches` counts batches that received an event during the backpressure interval.

Timing starts when the first resolved event enters the renderer's enqueue path:

- `queueWaitMs`: first receipt to flush start, including routing/normalization and batching wait.
- `callbackMs`: synchronous batch dispatch duration, including callback/reducer/store work.
- `receiveToCallbackEndMs`: their per-batch sum, measured from the oldest receipt.

These measurements exclude transport decoding before enqueue, upstream proxy/network time, model/tool
execution, asynchronous callback work, React commit, and browser paint. They do not measure TTFT or
user-visible end-to-end latency. Compare similar event rates, project counts, histories, and visibility
states; queue timing includes the existing 33 ms flush policy and 200 ms backpressure policy.

## Repeatable CPU benchmarks

From the repository root:

```sh
pnpm run bench:sync-transport
pnpm run bench:sync-hotpath
```

The codec benchmark uses the installed published SDK and reports its configured pin, Node version,
CPU, platform, exact payload sizes, and median encode/decode microseconds. It runs one warmup and
five measured rounds, alternates codec ordering, and asserts round-trip equality. Fixtures are synthetic.
Dynamic Protobuf `Struct`/`Value` payloads can retain field names and cost more than JSON; this result
must not be generalized to generated codecs with concrete typed schemas. Sizes exclude framing;
the session fixture uses the logical `JsonResponse` wrapper for both codecs.

The hot-path benchmark compares sequential and batched state updates and full versus incremental
turn projection already present in the implementation. It is a CPU microbenchmark, not an FPS test
or a claim that the current app gained that factor of speed.

## A native transport experiment

If profiling supports one, compare equivalent authenticated runtime handlers through the existing
transport and a native host/SDK transport. Adding a gRPC server that calls the HTTP bridge introduces
another hop and is not a direct transport replacement. Keep AX Code as the runtime owner and consume
the published SDK and signed runtime without sibling source imports.

Capture p50/p95 request and runtime-event-to-visible-update latency, event throughput, CPU, memory,
and disconnect/recovery behavior at matched workloads (for example 1, 5, and 20 projects). Separate
native HTTP/2 from structured-clone IPC; the SDK supports both shapes but they have different costs.
Preserve authentication, cancellation/deadlines, ordering, cursor replay, deduplication, and gap resync.
The gRPC subscription shape alone does not prove parity with the current resumable Desktop event stream.
No runtime or renderer migration is enabled by this diagnostics change.
