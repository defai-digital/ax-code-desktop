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
2. ~~Large-document Markdown first parse~~ — dropped after the packaged trace below: parsing is under half of cold
   paint and already runs in a Worker, so no parser speedup can meet the adoption threshold.

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

- **Parsing is the minority of cold cost and already off the main thread.** At 500k characters the Worker round trip
  is about 41% of time to paint. Even a parser twice as fast would save about 190 ms (about 20%), below the 25% p95
  adoption threshold. The main-thread long tasks come from rendering, which a WASM parser does not touch.
- **Open-fence appends are not a problem in the real app.** About 40 ms from emit to paint and 12 ms of Worker time per
  append at 200k characters; the 11-03 responder-only figure (about 42 ms at 500k) does not translate into jank.
- **A fixed ~300 ms passes before the parser is even asked.** A phase split (two cold runs, same harness) puts
  emit → first Worker request at about 305–315 ms for 30k characters and 310–400 ms for 500k, with response → paint
  at about 20 ms and 245 ms respectively. The delay sits upstream of Markdown (event pipeline or message mount), not
  in the Worker client, which has no such timer. It is the largest single cold cost below 500k characters.
- **Re-theming a large document costs 200–400 ms.** One cold run of the existing `markdown-stream-webmcp.mjs` timed out
  its 10 s light-theme wait right after a build; two re-runs passed. Treat that as a cold-start flake, not a regression.

Conclusion: drop the WASM Markdown parser candidate. The better targets are render batching or virtualization of very
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

1. Ask the AX Code owner to publish an independently installable `@ax-code/diff-wasm` artifact.
2. ~~Capture packaged Markdown traces~~ — done (see above). A matching diff trace needs a large-diff stub fixture and
   is still open.
3. Keep Shiki JS; revisit only for a demonstrated grammar-compatibility or performance problem.
4. Investigate the large-message render path in TypeScript: the ~300 ms emit-to-parse delay, long tasks above
   100 ms at 500k characters, and finalization re-render cost.
