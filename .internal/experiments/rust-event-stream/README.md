# Direct Rust event client experiment

Status: Implemented experimental client; not selected for production

This is a manually invoked, unpublished Rust client for AX Code's existing `/global/event` SSE
interface. It is not a coding runtime, a full Rust SDK, or a new AX Code service. It consumes the
public wire contract without importing sibling source. No production entry point, preload,
permission, SDK/runtime pin, native packaging, or updater configuration references this experiment.

## Plan

1. Implement a direct Rust SSE client with bounded framing and batched delivery.
2. Preserve domain events, ordering, cursor metadata, unknown events, and resync notifications.
3. Keep lifecycle supervision, renderer trust checks, acknowledgements, and recovery ownership in JS.
4. Test parser parity, limits, authentication, cancellation, and cursor checkpoint ordering.
5. Compare the current Desktop WS path, a direct JS IPC control, and the Rust IPC candidate through
   the same pipeline/reducer/React fixture before selecting a production migration.

The existing language-neutral gRPC proto permits generated Rust integrations, but the configured
Desktop runtime does not automatically expose a native gRPC endpoint. AX Code also has a MsgPack
IPC transport; the current producer's SSE-to-IPC event adapter discards `id:` lines, so it is not
assumed equivalent to Desktop's resumable SSE stream. This experiment uses SSE and its cursor.

## Run

From the repository root, with Cargo/Rust 1.88+ and the workspace's pinned pnpm dependencies:

```sh
pnpm run test:rust-event-client
pnpm run bench:rust-event-client
pnpm run probe:rust-event-client
```

The test command builds the frozen `Cargo.lock` into the ignored `.tmp/rust-event-stream-target`
directory, runs Rust tests, then Node integration tests. Benchmark and runtime probe commands
require that build first. The optional probe needs an installed `ax-code`; an explicit executable
path can be passed as an additional argument. It creates a temporary isolated runtime profile and
workspace, subscribes with one-time authentication, checks rejection without credentials, and
terminates both owned processes. It invokes no model. It does not qualify Desktop's pinned runtime.

Do not run CPU-heavy builds/tests concurrently with the benchmark. Benchmark subprocesses use
temporary profiles, offscreen windows, and dynamically assigned loopback ports. Numeric evidence
is written to `.tmp/rust-event-stream-benchmark.json`; the stdout summary omits all per-run detail.

## Native boundary and limits

`native-client.mjs` is a privileged experimental host adapter. It sends configuration to the
helper's stdin, not its argv or renderer. Only literal-loopback HTTP `/global/event` endpoints
without userinfo, query, or fragment are permitted. Proxies and redirects are disabled. Authorization
headers are sensitive; subprocess error output is not forwarded into host logs. Errors are fixed
codes without request URLs, credentials, response bodies, or event data.

The Rust decoder handles CRLF and UTF-8 boundaries across reads, multiline data, unknown fields,
and a final EOF frame. Frames are kept in order without native event coalescing. Subscription
acknowledgements become `ready`; heartbeat payloads are filtered like the current global WS bridge.
Domain events, including `server.resync_required`, keep their payload, directory, and event ID.

The bounds are deliberately smaller than some runtime limits and are experiment limits:

- Configuration: 16 KiB; resume cursor: 512 bytes.
- Partial SSE frame: 1 MiB; network chunk and encoded batch: 4 MiB.
- Batch: at most 512 frames, normally flushed within 2 ms of its first pending frame.
- Host IPC window: at most eight batches and 4 MiB of aggregate encoded data.
- Connect timeout: 2 seconds; read stall timeout: 20 seconds.

Each frame is serialized once. Bounded stdout provides process backpressure. The host window pauses
consumption when the renderer falls behind. Per-directory pipeline fences acknowledge applied
batches; acknowledgements may arrive out of order, but recovery checkpoints advance only across
a contiguous applied prefix. Early iteration exit, cancellation, window closure, or upstream failure
stops the owned helper. Neither adapter silently retries, replays uncertain effects, or starts a model.

V8 can represent lone UTF-16 surrogates and overflowed JSON numbers that `serde_json::Value` cannot.
The native client explicitly fails on those values instead of silently skipping data and advancing
its cursor. This is a production compatibility limitation, not permission to discard an event. A
future integration needs a lossless representation or an explicit JS fallback before adoption.

## What the comparison measures

The same authenticated synthetic SSE producer emits 40 revisions, each containing 50 text deltas
per project, at 25 ms intervals for 1, 5, and 20 projects. Each project starts with 2,000 cached part
records. The renderer uses the actual Desktop event pipeline and `applyPartDeltaBatch`, then renders
revision text with React. Every run asserts all characters/revisions, no callback errors, and ten
trusted fixture keystrokes. Rust and JS IPC use a benchmark-only hook adapter; the production event
transport is not extended or enabled by the fixture.

Three paths are compared:

- `js`: actual Desktop SSE hub/replay and WebSocket bridge/renderer adapter.
- `ipc-js`: JS SSE parsing directly into the same bounded Electron IPC batch window.
- `rust`: direct Rust SSE parsing, bounded stdout, host decoding, and the same IPC batch window.

There is one warmup and three measured rounds with rotating path order. Timing starts at synthetic
publication and ends at React layout-effect commit. The first four revisions are excluded. Medians
of each measured run's p95 are reported. Two-RAF next-frame and key-to-frame metrics are explicitly
proxies, not Chromium paint evidence. Epoch timestamps on the same host introduce clock-resolution
and scheduling noise; this is not a statistical guarantee or a full GUI acceptance test.

Host CPU includes the fixture producer and JS host. It excludes Rust and renderer CPU, so reduced
host CPU does not prove lower total CPU or energy. RSS samples are observations, not peak-memory
qualification. The current WS hub retains replay entries, while the direct candidates checkpoint
the runtime cursor and require a future supervisor/resync integration; the architectural control
is essential to avoid crediting Rust for removing a JS transport layer.

## Adoption decision

The planned screen is at least 30% improvement in the large-workload publication-to-commit p95,
no material small-workload/input regression, and full delivery parity. This fixture is only a
screen: successful results would still need real app paint, supervisor/reconnect/dedup tests,
lossless schema compatibility, and signed cross-platform packaging evidence.

The measured Rust candidate fails the latency screen. Keep the production path and retain this
client as a reproducible experiment. See the [evaluation report](../../reports/PERFORMANCE-2026-10-13-rust-event-client.md).
