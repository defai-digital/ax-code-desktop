# Direct Rust event client implementation and evaluation

Date: 2026-10-13
Status: Implemented and tested as an isolated experiment; not adopted for production
Baseline: `01e5c5ebeedd6a18e621f9f3b96ef217f3a573bb`

## Outcome

The Rust client directly consumes AX Code's authenticated, resumable SSE interface and delivers
bounded batches to an Electron host. The implementation verifies that Rust can call the existing
runtime directly, but the tested candidate does not improve the high-load renderer latency.
Keep the production Desktop event path. The JavaScript IPC architectural control is a more promising
follow-up candidate than this Rust bridge; it is not enabled by this change either.

## Implementation

The unpublished crate and host adapter live in `.internal/experiments/rust-event-stream`. The crate
uses frozen Cargo dependencies and no sibling source, runtime implementation, or private SDK imports.
It owns only client-side SSE framing, payload normalization, and batch encoding. The host owns lifecycle,
renderer checks, bounded IPC delivery, and acknowledgement checkpoints. The existing SDK/runtime pins,
production preload, protocol manifest, packaging, and updater settings are unchanged.

The client preserves unknown/domain events, directory, event ID, and resync notifications. It serializes
each frame once and flushes at 512 frames, a byte boundary, or a 2 ms pending-frame deadline. Partial
frames are capped at 1 MiB, batches at 4 MiB, and the host window at eight batches and 4 MiB aggregate
encoded data. Applied per-directory fences acknowledge delivery; only a contiguous acknowledged prefix
advances the recovery cursor. Cancellation/early iteration exit stops the helper without hidden retries.

Only literal-loopback HTTP `/global/event` endpoints are accepted. Redirects/proxies are disabled and
credentials are sent through private stdin configuration, never renderer IPC, argv, logs, or evidence.
Subprocess diagnostics use fixed error codes. V8-only lone-surrogate/overflow JSON values cause explicit
native failure rather than a skipped event and silently advanced cursor. Lossless handling of those
values is a production adoption requirement.

The repository offers a language-neutral gRPC proto and a JS/native facade, not a complete first-party
Rust SDK crate. The existing AX Code MsgPack IPC event adapter discards SSE `id:` metadata, so this work
does not assume it has Desktop cursor parity or introduce an invented native gRPC endpoint.

## Controlled comparison

The pinned Electron 44.7.0 / Chromium 152.0.7977.130 fixture runs actual Desktop WS hub/bridge,
pipeline, and delta reducer code, with a production React bundle and an isolated offscreen renderer.
A synthetic authenticated SSE producer emits 40 revisions of 50 deltas per project at 25 ms intervals.
Each project has 2,000 cached part records. Three paths rotate execution order across one warmup and
three measured rounds: existing JS WS, direct JS IPC, and direct Rust IPC. The IPC paths share the same
bounded acknowledgement window. Initial four revisions are excluded from steady latency samples.

The metric below is publication to React layout-effect commit, not Chromium paint or model TTFT.
Values are medians of three measured runs' p95, on one macOS arm64 host:

| Active projects | Current JS WS p95 | Direct JS IPC p95 | Rust IPC p95 |
| --------------- | ----------------: | ----------------: | -----------: |
| 1               |          28.42 ms |          26.53 ms |     28.61 ms |
| 5               |          28.80 ms |          28.69 ms |     29.44 ms |
| 20              |          38.26 ms |          29.08 ms |     76.67 ms |

At 20 projects, median host CPU was 640.883 ms for current JS WS, 252.945 ms for direct JS IPC, and
220.148 ms for Rust IPC. These figures include synthetic producer/host work and exclude Rust and
renderer CPU. They cannot establish lower total CPU or energy. The Rust helper's observed RSS was
4,240 KiB; that is not peak-memory qualification. Next-frame/key-to-frame values in the evidence are
explicit RAF proxies, not actual paint or Event Timing acceptance.

An initial 128-frame prototype exhibited substantially worse backlog under load. Increasing batch
capacity to 512, retaining the aggregate encoded-byte window, and avoiding repeated Rust serialization
reduced that backlog but still failed the latency screen. The accepted three-path comparison above
includes the final bounds; earlier exploratory timing runs are not used as acceptance evidence.

All 36 runs assert complete application of all text characters/revisions, ten fixture keystrokes,
and zero callback errors. The evidence contains numeric measurements only:
[measurements.json](rust-event-client-2026-10-13/measurements.json). The experiment README contains
the repeatable commands, protocol, ownership boundaries, and detailed limitations.

## Runtime proof and validation

`pnpm run probe:rust-event-client` started installed AX Code 7.25.0 with a temporary test home and
workspace, a dynamic loopback port, and one-time Basic Auth. The native client was rejected without
credentials and received `ready` with credentials. Both processes were terminated afterward, without
model calls or inherited provider credentials. This establishes a real runtime handshake, not the
configured Desktop runtime 7.24.4's signed inventory or cross-platform release qualification.

- `pnpm run test:rust-event-client`: 6 Rust tests and 11 Node tests passed.
- Rust Clippy for all targets with `-D warnings`: passed.
- Full workspace `pnpm run test`: 3,113 passed, 7 existing skips, no failures.
- `pnpm run check:boundaries`, including release contract and unchanged SDK/runtime pins: passed.
- Workspace typecheck and lint: passed. Desktop build: passed using all three existing Turbo cache entries.
- Rust formatting, JavaScript syntax, targeted Prettier, and diff whitespace checks: passed.
- Real Electron comparison: all 36 runs passed delivery/input assertions.

The planned performance screen requires at least 30% large-workload publication-to-commit p95
improvement with delivery parity and no material small-workload/input regression. Rust fails the
latency screen. A future production candidate additionally needs real application paint, notification
and reconnect/dedup parity, lossless schema compatibility, full CPU/memory measurements, and signed
cross-platform installation/upgrade/rollback evidence. This commit does not activate either candidate.
