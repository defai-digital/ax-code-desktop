# Native Rust Markdown parser evaluation

## Decision

Large Markdown syntax parsing is a credible candidate for a native Rust prototype.
Do not replace the production parser yet: the raw native AST changes math rendering
and source positions, and this experiment does not measure first formatted paint
through a production Electron bridge. Keep Electron and the current JS fallback.

No application runtime, renderer permissions, CSP, IPC, SDK/runtime pins, packaging
or release policy changes are included. The executable is manually invoked under
`.internal/experiments/markdown-rust`; its Cargo lockfile freezes the experiment's
dependencies. It is neither bundled nor started by the desktop application.

## Method

The runner uses the current JS streaming block projection and remend output for
both parsers. JS uses the installed unified/remark/GFM/math parser. Rust uses
[`markdown` 1.0.0](https://docs.rs/markdown/1.0.0/markdown/) with GFM and math enabled,
which exposes MDAST and optional serde serialization. This preserves a plausible
integration point with the existing ReactMarkdown renderer rather than replacing
custom components with generated HTML.

Two serial full runs on the same macOS arm64 host collect 20 measured samples per
fixture after three warmups, alternating execution order. Timing does not include
the subsequent rendering and compatibility checks. The full raw samples and host
information are in [run A](markdown-rust-2026-10-11/run-a.json) and
[run B](markdown-rust-2026-10-11/run-b.json). Node 26.5.0 and Rust 1.99.0 were used.

JS parse-plus-clone includes a local `structuredClone` of complete ASTs. It is not
an actual Web Worker round trip. Rust round-trip includes request JSON encoding,
native pipe transport, request decoding, parsing, complete AST serialization,
return transport and JS JSON decoding. The subprocess is persistent and warm;
startup, app IPC, rendering, layout, paint and queueing are excluded. Streaming
projection/healing is measured separately once per fixture, not as a p95 or an
incremental streaming benchmark. Native parsing is wall-clock service time, not
a process CPU or energy measurement.

## Results

All values are sample p95 milliseconds. Ratios compare the JS parse-plus-clone
timer with the native pipe-and-decode timer; they are not GUI speedups.

| Fixture / run | JS parse | JS parse + clone | Rust parse | Rust pipe + decode | Ratio |
| --- | ---: | ---: | ---: | ---: | ---: |
| 211,500-character paragraph / A | 695.59 | 726.02 | 156.43 | 174.95 | 4.15x |
| Same paragraph / B | 428.77 | 457.11 | 156.13 | 174.51 | 2.62x |
| 204,000-character, 6,000-block stream / A | 416.29 | 471.82 | 37.64 | 68.28 | 6.91x |
| Same block stream / B | 431.54 | 486.26 | 41.71 | 70.16 | 6.93x |

The paragraph's JS tail latency varies substantially between runs; retain both
rather than selecting the fastest or slowest comparison. The native result is
promising across these workloads, but neither run measures continuous app streams.
Projection/healing costs another roughly 74-87 ms for the paragraph and 37-40 ms
for the block fixture in these once-only measurements, shared by both parsers.
Rust would not remove this work or downstream React/DOM work.

Small fixtures are sub-millisecond in many samples and susceptible to scheduling
noise. Native transport can be slower: the reference fixture in run B has native
round-trip p95 1.32 ms versus JS parse-plus-clone 0.27 ms. Retain the small-body JS
path; do not generalize the large-fixture gains to every Markdown message.

## Compatibility

All nine fixtures have equivalent semantic AST fields after excluding positions,
math renderer metadata and null optional fields. Eight produce identical static
markup through the real `PreparedMarkdown` component, which retains ReactMarkdown
URL filtering and rehype-KaTeX. This is not full custom-component or browser parity.

Confirmed blockers are retained as assertions in the executable benchmark:

- The combined GFM/math fixture renders differently: Rust math nodes lack remark's
  `data.hName`, `hProperties` and `hChildren` metadata used by the renderer/KaTeX.
- For a Unicode/entity fixture, the root end offset is 74 in JS and 94 in Rust.
  The Rust offset reflects UTF-8 bytes rather than the renderer's UTF-16 units.
  All descendant positions must be converted and tested, not just the root.
- The GFM list's end position differs even with ASCII input: JS ends on line 6,
  Rust on line 7. A Unicode offset conversion alone does not establish parity.
- The unsafe-image fixture triggers the existing React SSR warning about an empty
  image source in both paths after URL filtering. No browser/network request runs.

Coverage also includes tables, checked/unchecked tasks, strikethrough, autolinks,
footnotes, entities, Unicode, raw HTML/unsafe links, Mermaid/open fences, incomplete
links and reference definitions. Nine fixtures cannot qualify every grammar edge.

## Next acceptance gate

Implement a benchmark-only compatibility adapter first and expand regressions
around math, byte/UTF-16 boundaries, CRLF, list positions and footnotes. Measure
adapter cost as part of native round-trip time. Then replay a bounded prototype
using the production Electron protocol/CSP, asynchronous native execution and the
existing renderer. Measure request-to-first-complete-formatted-paint, queue wait,
startup, memory and cancellation with representative concurrent streams.

The proposed adoption gate remains at least 30% improvement in end-to-end p95
for large content, no small-content regression and supported syntax/component
parity. This parser-only experiment does not pass that gate. Rust/WASM compilation
would also encounter the existing packaged CSP restriction; no CSP expansion is
part of this work. Native distribution would require separate cross-platform
build, signing and lifecycle evidence before shipping.

## Reproduction and validation

Follow the [experiment README](../experiments/markdown-rust/README.md). Keep the
generated Cargo `target/` directory out of source control. No model calls, live
project access or canonical worker runtime execution are involved.

Validation completed:

- Two full native benchmark runs, each with nine fixtures and 20 measured samples.
  Run B also asserts the exact set of known position mismatches.
- `cargo build --release --locked`, `cargo fmt --check` and
  `cargo clippy --locked --all-targets -- -D warnings` passed for the experiment.
- Workspace typecheck and lint passed.
- Workspace tests: 2,861 passed, one skipped.
- `pnpm run check:boundaries` passed, including shadow-only release policy and
  release identity contract checks.

No desktop production build or native cross-platform package qualification was
performed for this benchmark-only change. No application performance improvement
is shipped by this commit; it identifies the next candidate and compatibility work.
