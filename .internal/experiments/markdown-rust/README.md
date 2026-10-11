# Native Markdown parser experiment

This is a manually invoked benchmark executable, not an application component.
It is not referenced by desktop entry points, packaging, IPC, the SDK contract,
or the signed AX Code runtime. It does not implement a coding runtime.

The persistent executable reads newline-delimited JSON `{ "sources": [...] }`
from stdin and writes `{ "trees": [...], "parseMs": ... }` to stdout. Inputs are
the existing JavaScript streaming projection and remend output. Rust replaces
only remark's syntax parsing, using `markdown` 1.0.0 with GFM and math enabled.
Each request returns complete MDAST, including position information; the runner
includes request encoding, pipe transport, response serialization and JavaScript
JSON decoding in its native round-trip timer.

From the repository root:

```sh
cargo build --release --locked --manifest-path .internal/experiments/markdown-rust/Cargo.toml
pnpm --dir desktop/packages/ui exec tsx src/components/chat/markdownNative.bench.ts
```

Use `--compatibility-only` to run the seven small compatibility fixtures without
the two large workloads. The full run alternates JS-first and Rust-first order,
discards three warmups, and retains 20 samples per fixture. Do not run builds or
other CPU-heavy checks concurrently with performance collection.

The runner asserts semantic AST parity after removing positions, math rendering
metadata and null optional fields. It also renders both trees through the actual
`PreparedMarkdown` component and checks all descendant positions. It deliberately
asserts the known failures: missing math metadata changes rendering, and both
Unicode and the GFM list fixture have position differences. Passing the benchmark
does not mean the raw Rust AST is a drop-in replacement.

The JS timer uses parse plus `structuredClone`, not a real Web Worker round trip.
The Rust timer uses a warm native subprocess, not a production Electron bridge.
This experiment excludes process startup, streaming projection from the timed
comparison, queueing, DOM/layout, paint, custom application components and native
distribution/signing. It is a parser-service feasibility comparison, not a GUI
latency acceptance test. Small bodies still use the existing JS path in the app.

See the [evaluation report](../../reports/PERFORMANCE-2026-10-11-markdown-rust-evaluation.md)
for the migration decision and required follow-up evidence.

## Completed compatibility and Electron evaluation

The [completion report](../../reports/PERFORMANCE-2026-10-11-markdown-completion.md)
records the native adapter, 25 compatibility fixtures, real-component paint
measurements and the decision to retain the optimized JS worker. Native Rust is
not selected for production: its measured bridge overhead fails the adoption gate.

After building the locked native executable, run the direct audit:

```sh
pnpm --dir desktop/packages/ui exec tsx src/components/chat/markdownNativeCompatibility.bench.ts
```

The captured native trees in `compatibility-fixtures.json` allow ordinary Vitest
to check the adapter against the installed JS parser without requiring Cargo in
application CI. The native audit additionally checks the live executable.

To reproduce the isolated Electron comparison, create the temporary web entry
from the repository root, then build from the web package so Babel resolves its
existing React compiler. Existing files at that temporary path must be preserved.

```sh
mkdir -p desktop/packages/web/native-markdown-perf
cp .internal/experiments/markdown-rust/electron/renderer.html .internal/experiments/markdown-rust/electron/renderer.tsx desktop/packages/web/native-markdown-perf/
cd desktop/packages/web
AX_NATIVE_BENCH_BASELINE=1 node ../../../.internal/experiments/markdown-rust/electron/build.mjs
cd ../../..
AX_NATIVE_BENCH_OUTPUT=/tmp/ax-markdown-baseline pnpm --dir desktop/packages/electron exec electron ../../../.internal/experiments/markdown-rust/electron/run.cjs
cd desktop/packages/web
node ../../../.internal/experiments/markdown-rust/electron/build.mjs
cd ../../..
AX_NATIVE_BENCH_OUTPUT=/tmp/ax-markdown-candidate AX_NATIVE_BENCH_PARSER=js AX_NATIVE_BENCH_DIST=/tmp/ax-coder-native-markdown-candidate-dist pnpm --dir desktop/packages/electron exec electron ../../../.internal/experiments/markdown-rust/electron/run.cjs
```

Optional `AX_NATIVE_BENCH_REVERSE=1` reverses parser order;
`AX_NATIVE_BENCH_SCENARIO=paragraph,blocks` restricts scenarios. Remove only your
two temporary fixture files and their directory before ordinary desktop builds.
The harness deliberately uses a fixture-only IPC bridge and independent user
data. It is not referenced by production entry points or packaging.
