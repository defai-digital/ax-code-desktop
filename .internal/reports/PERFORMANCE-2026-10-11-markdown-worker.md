# Large Markdown parsing in a worker

## Implementation

Markdown bodies of at least 16,384 UTF-16 characters now use a lazily created
module worker. It performs streaming block projection, healing, and the same
remark/GFM/math syntax parsing that ReactMarkdown normally performs on the UI
thread. Smaller bodies retain the existing synchronous incremental block path.

The worker returns MDAST, not HTML. A final remark plugin supplies that prepared
tree to ReactMarkdown's parser interface; the UI does not parse its source again.
ReactMarkdown still performs HAST conversion, URL filtering, KaTeX rendering,
and custom-component rendering. Existing file/image links, Mermaid controls,
copy controls, and code components remain at their original integration points.
This uses the documented [unified parser interface](https://github.com/unifiedjs/unified)
and [ReactMarkdown plugin architecture](https://github.com/remarkjs/react-markdown).

The client submits one active request and retains only the latest pending request
per consumer. Global pending source is bounded to four million UTF-16 characters
and 16 consumers; individual source is limited to one million characters. A
five-second watchdog terminates a hung worker and settles outstanding consumers.
Crash, construction, postMessage, and message-decoding failures use the same
fallback. After a transport failure the client remains disabled for that page
lifetime, avoiding repeated respawn or hang loops. There is no transcript cache
inside the worker or client. Completed result state belongs to mounted hooks and
is cleared when switching back to the small-body path.

Streaming can display the last completed parse while the latest version is being
processed. In-flight previews are accepted only for the same message/mode and an
append-only source. Finalized content requires an exact source match. Revision
ordering prevents an older parse from replacing a newer complete fallback.
Unmount releases pending work and suppresses old callbacks; a released active
request does not cancel another consumer's queued parse.

While waiting for an initial large parse, or on failure/resource rejection, the
renderer exposes the full source as React-escaped plain text. It never retries an
expensive synchronous parse as a fallback. Rich formatting is unavailable in that
fallback, including for source above the individual size limit. Message copy
retains the existing source path. Image sharing captures the currently rendered
preview, so it can capture a pending preview or plain-text fallback. No
truncation or silent source mutation is introduced.

## Build integration

Existing parser dependencies are now explicit exact dependencies: `unified`
11.0.5, `remark-parse` 11.0.0, `decode-named-character-reference` 1.3.0, and the
MDAST types 4.0.4. The web configuration resolves the entity decoder's DOM-free
entry for both page and worker builds. Its browser entry eagerly calls
`document.createElement`, which is unavailable in a worker; a production replay
caught this despite unit tests passing in jsdom. Named, numeric, and unknown
entity output is included in the parity regressions. Existing bundle-size
warnings remain; worker loading is deferred until a large body requests it.

Electron, the signed runtime pin, SDK version, credentials, IPC permissions,
packaged CSP, and release policy are unchanged by this implementation.

## Regression coverage

Nineteen focused tests cover output parity for formatting, links, GFM tables and
tasks, footnotes, entities, math, code and Mermaid fences, unsafe URLs/HTML, and
reuse of parsed trees. A prepared-tree test deliberately supplies different
source text to prove that the renderer does not parse it again. Lifecycle tests
cover first paint, streaming previews, exact completion, replacement/session
changes, newer fallback ordering, short bodies, and unmount. Scheduling tests
cover coalescing, per-consumer release, timeout, failures, and queue/payload limits.

## Renderer evidence

Use the archived fixture with `AX_PERF_PACKAGED_PROTOCOL=1`. This mode registers
the production `app://ax-code` protocol privileges and handler, applies the
existing packaged CSP, and supplies inert desktop/API-origin projections before
module imports. No real AX Code runtime or model request runs. Worker counters
and formatted-node counts distinguish successful parsing from fast plain-text
fallback. Preliminary runs with missing fixture desktop identity or the
DOM-dependent decoder were discarded as performance evidence.

Accepted evidence is in [markdown-worker-2026-10-11](markdown-worker-2026-10-11/summary.json),
including full metrics and a visually inspected paragraph screenshot. Each
scenario received and inserted all 79 native key characters, with zero captured
runtime errors and zero worker failures. Electron 42.5.2 / Chromium 148.0.7778.271
ran the production Vite/React compiler output on the same macOS host used for
the preceding measurements.

| Warm 4,000-message scenario | Prior virtualizer fix only | With worker |
| --- | ---: | ---: |
| Large paragraph observed keydown p95 | 360 ms | 56 ms |
| Large paragraph RAF interval p95 | 350 ms | 33.8 ms |
| Large paragraph tasks over 50 ms | 84 | 0 |
| Large paragraph stream publications | 85 | 244 |
| Ordinary Markdown observed keydown p95 | 32 ms | 40 ms |
| Ordinary Markdown tasks over 50 ms | 0 | 0 |

The paragraph replay submitted 239 worker requests and received 102 successful
previews during the observer window; intermediate pending versions were
coalesced, not parsed in an ever-growing queue. The source store still received
all stream publications. Ordinary Markdown submitted and completed 71 worker
requests; its DOM contained 251 formatted strong nodes. The paragraph contained
2,672 formatted strong nodes, confirming that fast fallback did not produce the
accepted results. Ordinary Markdown was already responsive, and this single
run does not establish a latency improvement for that case.

The preceding comparison used loopback transport; this replay used packaged
protocol transport. Both use the same components, production compiler, window
size and workloads, but they are single runs rather than a simultaneous
statistical A/B study. The previous evidence is retained without rewriting it.
This renderer transport test does not
establish signed packaging, cold startup, cross-platform, or complete portfolio
performance. Native key Event Timing is rounded and excludes events below its
16 ms observer threshold. RAF gaps are scheduling evidence, not exact compositor
dropped-frame counts.

## Verification

- `pnpm run test`: 2,843 passed, one skipped (61 root scripts, 390 Electron,
  1,598 UI, 794 web tests passed).
- `pnpm run typecheck`, `pnpm run lint`, `pnpm run check:boundaries`: passed.
- `pnpm install --lockfile-only --frozen-lockfile --offline --ignore-scripts`:
  passed manifest/lockfile consistency validation; not a fresh full install.
- `pnpm run build`: all three Desktop tasks passed, including the Electron arm64
  native rebuild. Existing bundle-size warnings remain.
- Production-config renderer replay through the existing packaged protocol/CSP:
  both scenarios completed with successful worker parsing and no runtime errors.
- Unrelated local Electron recovery edits and reference clones are preserved and
  excluded from this commit. Workspace verification includes those local edits.

## Rust decision

Keep the current JavaScript parser for this change. Moving expensive parsing off
the UI thread preserves the established syntax and component contracts. Rust/WASM
inside the worker remains a candidate if measured parser service time or CPU
consumption warrants it. A language migration alone would not bound DOM/layout,
React reconciliation, or main-thread work. Expanded tool-output virtualization
and syntax-highlighter work remain separate future improvements.
