# WebAssembly speed and stability reassessment

Date: 2026-11-08. Desktop baseline: `cc823b81` (Desktop 7.30.13, Electron 45.2.3, AX Code 7.30.16, SDK 2.6.69).
Status: assessment only. A report is evidence or a proposal; it does not amend an accepted PRD, ADR, specification, or
release authorization, and it authorizes no migration.

This revisits the [selective WebAssembly assessment](wasm-review-20261103/README.md) and the
[canonical diff consumer qualification](diff-qualification-20261103/README.md) against current source and the current
AX Code release channel. Measurements are from the 2026-11-03 evidence except the packaged-renderer trace, run on 2026-11-08.

## Decision

Do not start a broad WASM migration. Most remaining speed and stability risk comes from unbounded or synchronous work,
lifecycle races, and rendering cost, none of which a language change removes. Two candidates remain, both gated:

1. **Canonical AX Code diff engine (`@ax-code/diff-wasm`)** — highest value, currently blocked on delivery.
2. **Large-document Markdown first parse** — deprioritized after the packaged trace below. The largest cold cost was
   a React Suspense reveal throttle, now fixed. Parsing runs in a Worker and only dominates at ≥300k characters.

Diff syntax highlighting stays on Shiki JS. The terminal already uses WASM through AkiTTY Web and is upstream-owned.

## What changed since 2026-11-03

- **No installable diff artifact yet.** The AX Code releases `v7.30.16` and `v7.30.17` and SDK releases through
  `sdk-v2.6.70` list no diff or WASM asset (GitHub release query, 2026-11-08). The 11-03 packed tarball failed a clean
  install because `@ax-code/util@1.3.2` returned HTTP 404; nothing observed since resolves that closure. Desktop must
  not consume sibling source or ignored build output, so integration cannot start.
- **Stale highlighter comment fixed.** `DiffWorkerProvider.tsx` claimed packaged `app://` workers cannot compile
  WebAssembly. The packaged renderer CSP (`desktop-renderer-protocol.js`) and web CSP (`response-headers.js`) both
  allow `'wasm-unsafe-eval'` (not `'unsafe-eval'`). Commit `fdf135e1` replaces the comment with the measured rationale
  for keeping `shiki-js`. Behavior is unchanged; the packaged Shiki WASM asset path remains uncertified.
- **Electron 45.2.3** (commit `35e9b684`) does not change WASM policy. No CSP, COOP/COEP, or SharedArrayBuffer change
  is required or proposed.

## Area inventory

| Area | WASM today | Assessment |
| --- | --- | --- |
| Terminal (AkiTTY Web → Ghostty VT) | Yes | Improvements belong in canonical AkiTTY source, then a verified pin update (ADR-023, ADR-024) |
| Diff syntax highlighting (Shiki via Pierre) | No, by choice | Measured no consistent win (TS 180k chars: 203.7 vs 205.6 ms; JSON 100k: 29.4 vs 35.7 ms). Keep JS |
| Diff/hunk computation (`diffHunkRevert.ts`, `toolDiffUtils.ts`) | No | Adopt the canonical engine once delivered; do not write a Desktop kernel |
| Markdown parse/lex (`markdownWorkerParser.ts`) | No | Research candidate; first parse and long open fences are the costly shapes |
| Fuzzy search, Mermaid layout | No | Reserve only; no real workload bottleneck shown |
| Sync pipeline, stores, React/DOM, CodeMirror | No | Poor fit; identity, scheduling, and incremental state dominate |
| Git, PTY, IPC, filesystem, process supervision | Native | Poor fit; WASM does not reduce host I/O latency or fix lifecycle races |
| Repository search, wiki, credentials, policy | Runtime-owned | Out of Desktop scope (AX Code, AX Agent, AX Trust ownership) |

## Candidate 1: canonical diff engine

AX Code commit `912c8f92` supplies a Worker-hosted Rust/WASM engine with `diff`, `applyHunks`, `applyPatch`,
`compare`, abort, timeouts, bounded input/output, strict stale-context rejection, and Worker recreation. The 11-03
qualification passed 225 forward round trips, 225 exact metadata matches against Pierre, and 434 reject comparisons.

The main gain is **stability**, not raw speed: hunk computation on cache misses currently runs synchronously on the
renderer thread, and moving it behind an interruptible Worker bounds the worst case for large or fragmented diffs.
Integration points and ordering are in the [canonical diff plan](markdown-optimization-20261103/canonical-diff-plan.md).

Unblock condition: an owner-published, exact-version artifact (GitHub Release tarball or GitHub Packages) whose runtime
dependencies are resolved or bundled, with browser worker/WASM assets, integrity, and NOTICE, that installs cleanly
outside the canonical workspace. Then pin it through pnpm and follow PRD → ADR → spec → implementation.

### Measured diff cost (2026-11-08)

`pnpm run bench:diff-hunks` (`desktop/packages/ui/src/components/views/diffHunkRevert.bench.ts`) times the synchronous
hunk work that runs on the renderer thread, on the same V8 engine the renderer uses. Medians, macOS arm64:

| Fixture | Parse | Cached lookup | Revert, before → after |
| --- | ---: | ---: | ---: |
| 2k lines, 3 edits | 1.2 ms | 0.4 ms | 1.0 → 0.5 ms |
| 20k lines, ~400 hunks | 35 ms | 4.6 ms | 32 → 4.8 ms |
| 50k lines, ~500 hunks | 69 ms | 10 ms | 60 → 11 ms |
| 1k-line full rewrite | 66 ms | 0.1 ms | 68 → 0.1 ms |
| 2k-line full rewrite | 265 ms | 0.3 ms | 262 → 0.3 ms |
| 5k-line full rewrite | 1,615 ms | 0.8 ms | 1,588 → 0.9 ms |

Scattered edits stay cheap even at 50k lines. **Rewrites are super-linear in edit distance:** a 5k-line rewrite freezes
the renderer for about 1.6 s, and the jsdiff options Pierre exposes are the non-abortable ones, so the parse cannot be
bounded. Before this change, opening such a diff parsed it twice on the main thread (Pierre's `FileDiff.render` and
`getFileHunks` for review navigation), and each hunk revert parsed it a third time.

Interim fix: `diffHunkRevert.ts` now caches the full parse result. `PierreDiffViewer` passes it to `render()` as
`fileDiff`, on a shallow copy carrying the viewer's highlight cache key and language. `revertHunk` resolves from the
cached parse (Pierre's `resolveRegion` copies rather than mutates). One parse per content pair remains, so a large
rewrite still freezes once. Removing that last freeze needs the parse off the main thread, which is what the
canonical Worker-hosted engine provides. This measurement strengthens Candidate 1.

## Candidate 2: Markdown first parse

The production responder measured 869 ms initial versus 2.6 ms append at ~500k characters (16,950 blocks), and about
42 ms per update for a ~500k-character unfinished code fence, which is reparsed each time. Incremental appends are
already cheap, so only cold parse, finalization, and long mutable tails justify research.

The [native Rust evaluation](PERFORMANCE-2026-10-11-markdown-rust-evaluation.md) found that a drop-in parser changes
math rendering and source positions. A WASM parser must preserve GFM, math, reference invalidation, offsets, unfinished
surrogate pairs, malformed-input behavior, and stable-prefix revisions, and must keep the MDAST contract that
ReactMarkdown filtering and custom components rely on.

Before any implementation, capture packaged traces that attribute parse, clone/transfer, HAST/KaTeX, React commit, and
paint separately. Downstream UI work may exceed parse cost for large documents. Then compare three variants: current,
optimized JS in the same Worker, and WASM in the same Worker and protocol.

### Packaged-renderer trace (2026-11-08)

The attribution step was implemented as `desktop/packages/electron/scripts/e2e/markdown-trace-webmcp.mjs` and run
against the built Electron 45.2.3 app on macOS arm64: three cold runs per size, one host, other activity uncontrolled.
The raw receipt is [markdown-trace.json](wasm-trace-20261108/markdown-trace.json). Medians:

| Workload | Cold paint | Worker parse | Longest main-thread task | Finalize (worker) | Re-theme |
| --- | ---: | ---: | ---: | ---: | ---: |
| 100k chars, 197 sections | 457 ms | 96 ms | none ≥ 50 ms | 108 ms (57 ms) | 85 ms |
| 300k chars, 590 sections | 687 ms | 229 ms | 80 ms | 239 ms (173 ms) | 227 ms |
| 500k chars, 983 sections | 937 ms | 385 ms | 132 ms | 542 ms (308 ms) | 208 ms |
| 200k-char open fence, 30 appends | 400 ms cold | 12 ms per append | none ≥ 50 ms | n/a | n/a |

Findings:

- **Parsing was the minority of cold cost and runs off the main thread.** Before the fix below, the Worker round
  trip was about 41% of time to paint at 500k characters. The main-thread long tasks come from rendering, which a
  WASM parser does not touch.
- **Open-fence appends are not a problem in the real app.** About 40 ms from emit to paint and 12 ms of Worker time per
  append at 200k characters; the 11-03 responder-only figure (about 42 ms at 500k) does not translate into jank.
- **A fixed ~300 ms before the parser was asked was a React Suspense reveal throttle, now fixed.** A phase split put
  emit → first Worker request at about 305–315 ms at every size, while the message bubble mounted within 10 ms and the
  main thread sat idle. A second message in the same page load showed text in about 23 ms, so the cost was one-time
  per load. Profiling, network interception, timer capture, and resource timing ruled out timers, the transcript
  materialization read, frame throttling, and chunk loading (the chunk was cached before the event). The cause:
  the first render of the lazy Markdown renderer suspends, and React 19.3.1 throttles revealing suspended content to
  300 ms after the last fallback. See "Fix: synchronous lazy resolution" below.
- **Re-theming a large document costs 200–400 ms.** One cold run of the existing `markdown-stream-webmcp.mjs` timed out
  its 10 s light-theme wait right after a build; two re-runs passed. Treat that as a cold-start flake, not a regression.

### Fix: synchronous lazy resolution

`components/chat/markdownRendererChunk.ts` loads the renderer module once (with chunk recovery). `ChatContainer`
preloads it at idle time (`lib/idleTask.ts`). Once the module is loaded, the `React.lazy` factories in
`MarkdownRenderer.tsx` return a synchronously resolving thenable, which React accepts without suspending. The first
render therefore skips both the load and the reveal throttle. If a message renders before the preload completes, it
falls back to the previous asynchronous path. A unit test renders the lazy component for the first time inside a
synchronous `act` and fails without the synchronous path.

Packaged trace after the fix (three cold runs, medians; receipts
[after-preload](wasm-trace-20261108/markdown-trace-after-preload.json) and
[500k](wasm-trace-20261108/markdown-trace-after-preload-500k.json)):

| Workload | Cold paint before | Cold paint after | Emit → first text after |
| --- | ---: | ---: | ---: |
| 30k chars | ~398 ms | 80 ms | 17 ms |
| 100k chars | 457 ms | 169 ms | 27 ms |
| 300k chars | 687 ms | 392 ms | 55 ms |
| 500k chars | 937 ms | 614 ms | 83 ms |
| 200k-char open fence | 400 ms | 83 ms | n/a |

Worker parse time is unchanged, so at 500k characters it is now about 61% of cold paint. A parser twice as fast
would save about 186 ms (about 30%) there, which would clear the 25% threshold for that workload alone. It would not
help at 100k characters or below, where cold paint is now under 170 ms. It would not remove the main-thread long
tasks (up to about 147 ms), which come from rendering. A 2x semantics-compatible WASM parser is also unproven: the
Rust evaluation changed math rendering and source positions.

A CPU profile of the 500k cold render after the fix attributes most of it to native style, layout and paint
(about 406 ms of `(program)`). The largest JavaScript item (about 72 ms) is the chat auto-follow check reading
`scrollHeight`, which forces that same layout synchronously. About 38 ms is the harness's own per-frame heading
check, so measured cold paint slightly overstates the product cost. An experiment with `content-visibility: auto`
on the blocks of messages with 150 or more blocks gave no reliable gain (585 vs 614 ms cold paint, long tasks
unchanged) and doubled re-theme time (472 vs 208 ms), so it was reverted and not shipped.

Conclusion: deprioritize the WASM Markdown parser. Keep it only as a conditional candidate for very large (≥300k)
documents, if real sessions show that size is common. Render-path work in TypeScript comes first. The better targets are render batching or virtualization of very
large messages, finalization re-render cost, and the unattributed mount latency, all in TypeScript.

## Stability

Reliable stability gains come from bounded work and lifecycle control, regardless of language:

- Keep work off the main thread. A synchronous WASM call blocks paint like JS; a deadline on the blocked thread cannot
  preempt it.
- WASM does not fix infinite loops, unbounded allocation, retained references, response reordering, or races. A trap
  surfaces as a host exception but does not make the app crash-proof.
- Fit any kernel into the existing envelope: the Markdown client already enforces 16 pending jobs, 4,000,000 retained
  code units, a 1,000,000-per-input cap, timeout/restart, a three-failure cooldown, and stale-revision rejection.
- Track JS heap, WASM linear memory, and process RSS separately. Recreate instances to release high-water memory, and
  refresh typed-array views after memory growth.
- Start single-threaded inside an existing Worker. Threads and SharedArrayBuffer require cross-origin isolation that
  would affect embedded apps, previews, and auth flows.

## Adoption gates

Carried forward from the 11-03 assessment as suggested thresholds, not policy:

1. At least 25% lower end-to-end p95 for the targeted slow flow against the optimized JS variant.
2. No common-path p50 regression above 5%, and no more than 10% peak memory growth with a stable soak plateau.
3. All semantic fixtures pass, plus cancellation, trap, load-failure, and late-response paths with a JS fallback.
4. Packaged `app://` workers and web mode pass under the current CSP on macOS, Windows, and Linux release targets.
5. Pinned same-origin artifacts with provenance, integrity, versioned ABI, and NOTICE updates where required.

## Recommended next steps

1. Ask the AX Code owner to publish an independently installable `@ax-code/diff-wasm` artifact — requested in
   [defai-digital/ax-code#503](https://github.com/defai-digital/ax-code/issues/503).
2. ~~Capture packaged Markdown traces~~ and ~~measure diff cost~~ — done (see above). Large rewrites are the case
   that justifies the canonical diff engine.
3. Keep Shiki JS; revisit only for a demonstrated grammar-compatibility or performance problem.
4. Investigate the large-message render path in TypeScript: long tasks above
   100 ms at 500k characters, and finalization re-render cost. The ~300 ms first-render delay is fixed.
