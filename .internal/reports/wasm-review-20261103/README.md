# Selective WebAssembly assessment for AX Code Desktop

> Follow-up (2026-11-03): AX Code commit `912c8f92c` now supplies a Worker-hosted WASM diff engine with preview,
> strict hunk application and patch chunks. Prefer that canonical implementation over a new Desktop kernel.
> See the [updated integration plan](../markdown-optimization-20261103/canonical-diff-plan.md) and
> [implemented Markdown optimization](../markdown-optimization-20261103/README.md). The measurements below remain
> the original assessment evidence; they do not benchmark the newly completed canonical diff engine.

Date: 2026-11-03. Assessment/proposal only; no product implementation or release authorization.

Source: `86fed71500347e9878219c2b98d23abd52d7f8f8`, Desktop 7.30.12. Initial checkout was clean.
Host probes: macOS ARM64, Apple M3 Max, Node 26.5.0, pnpm 10.33.4; installed Shiki 4.5.0 and Pierre Diffs 1.2.11.

## Decision

Do not start a broad WASM migration. The best remaining research candidate is the **large-document Markdown
parse/lex kernel inside its existing Worker**, especially first parse, finalization, and large mutable tails.
Profile the complete renderer path before selecting a replacement. A second conditional candidate is **pure
large-file diff/hunk computation**, after moving expensive synchronous work behind an interruptible worker boundary.
Neither candidate has a demonstrated WASM speedup yet.

The easiest available experiment, switching existing diff highlighting from Shiki JS to Shiki WASM, was actually
measured. It did not show a consistent advantage in the tested corpus and should not become the default on this
basis. Fuzzy scoring and diagram layout are reserve candidates only if real workloads establish a bottleneck.

The product terminal is **AkiTTY Web**. Its internal Ghostty VT parser already uses WASM. The layering is
`AX Code Desktop -> AkiTTY Web -> Ghostty VT WASM`; this assessment does not propose replacing AkiTTY Web.

A report is not an accepted PRD, ADR, or specification. Any later source-ownership or architecture change must follow
this repository's accepted PRD -> ADR -> specification -> implementation process.

## Evidence and reviewer provenance

- Inspected current renderer, worker protocols, diff integration and installed dependency implementation, terminal
  bridge/provenance, sync scheduling, palette callers, filesystem/runtime adapter, Git subprocess service, and CSP.
- Grok CLI 1.0.70 and Muse Code 1.4.14 were invoked as independent, bounded advisory reviewers of curated, line-numbered
  source packets. They did not independently profile the app or inspect an unrestricted checkout. Read-only review
  was enforced by empty/disabled tools; no reviewer changes to product source were requested.
- Muse completed with exit 0 and a `run.terminal.completed` result. Its initial priorities were an upstream Shiki WASM
  experiment, then a conditional Markdown parser experiment. See [review](muse-review.txt),
  [receipt](muse.receipt.json), and [original packet](prompt.txt).
- Grok's first invocation stopped with `max_turn_requests`, exit 1, while asking to read an offloaded packet tail.
  It is not counted as a completed review. The reduced retry completed with exit 0, `stopReason: end_turn`,
  using `grok-4.7-build`. Grok recommended only the upstream Shiki experiment and no new custom kernel without
  profiling. See [review](grok-review.txt), [receipt](grok-retry.receipt.json), and [retry packet](grok-retry-prompt.txt).
- Existing benchmark: `pnpm run bench:sync-hotpath` completed successfully.
- Existing focused behavior tests: Markdown parser/client, PreparedMarkdown, and hunk revert: 4 files, 37 tests passed.
- No packaged Electron trace, interaction/FPS measurement, cold-process comparison, memory soak, or Windows/Linux
  run was performed. This is not performance qualification for shipping.

## Candidate inventory

Priorities below are research order, not approval to migrate.

| Area | Current source evidence | Assessment | First action / alternative | Relative effort |
| --- | --- | --- | --- | --- |
| Large Markdown parsing/lexing | `markdownWorkerParser.ts`, `markdownStreamBlocks.ts`, `markdownWorkerClient.ts`, `PreparedMarkdown.tsx` | Strongest conditional WASM kernel candidate; substantial initial parse work exists, but incremental appends can already be cheap | Attribute parsing, lexing, clone/transfer, HAST/KaTeX, React and paint separately; compare optimized JS Worker with a semantics-compatible WASM Worker | High |
| Large-file diff/hunk computation | `diffHunkRevert.ts:35-67`, `toolDiffUtils.ts:89`, `PierreDiffViewer.tsx` | Conditional pure-compute candidate; not the same operation as syntax highlighting | Measure cache misses, fragmented/long-line diffs and hunk revert; qualify the newly available canonical AX Code WASM engine through a pinned deliverable (see follow-up) | Medium-high |
| Diff syntax highlighting | `DiffWorkerProvider.tsx:28-74`; installed Pierre worker supports `shiki-wasm` | Cheap experiment already performed; no consistent speed case for default switch | Keep JS default; expand real language corpus only for demonstrated performance or grammar-compatibility issues | Low experiment; medium qualification |
| Local fuzzy matching/scoring | `fuzzySearch.ts:31,75,145`, `CommandPalette.tsx:626,653-726` | Low priority in actual palette usage | Reuse normalized data/indexes where meaningful, debounce/cancel, cap corpus, or move local scoring to a Worker; only consider resident WASM index if real local corpus is large | Medium |
| Mermaid layout | `mermaidRenderer.ts`, `mermaidRenderer.worker.ts`, `mermaidOfficialRenderer.ts`, `mermaidCapabilities.json` | Defer; only a separately identifiable pure layout kernel is plausible | Keep upstream rendering; profile existing Worker. Official DOM-based rendering requires a different isolation design, not simply recompiling it | High |
| AkiTTY Web terminal | `akitty-web/SOURCE.json`, `lib/ghostty.ts:270-289,362-407` | Already uses WASM; no new Desktop migration | Profile upstream byte batching, JS/WASM bridge, lazy row decoding, canvas paint and IME separately; change canonical AkiTTY source and re-import with provenance | Upstream-owned |
| Streaming transport, reducers, materialization, turn projection | `sync/event-pipeline.ts`, `materialization.ts`, turn projectors | Retain JS/TS; object identity, scheduling and incremental state dominate design | Preserve coalescing, removal barriers, structural sharing, bounded drains, stale-response rejection and retention limits | WASM rewrite not justified |
| React, Zustand, DOM, CodeMirror, component layout | Shared UI components and stores | Do not migrate wholesale | Rendering/virtualization/subscription profiling; keep component and lifecycle semantics in JS | Very high with poor fit |
| Repository search and wiki intelligence | `web/server/lib/fs/search.js:3-21`, `WikiGraphView.tsx:83-95` | Keep runtime ownership; no Desktop WASM duplicate | Runtime adapter already serves search; wiki panel opens runtime-exported viewer | Out of Desktop kernel scope |
| Git, PTY, IPC, process supervision, networking, file access | `web/server/lib/git/service.js`, terminal runtime, Electron shell | Keep native/host APIs and orchestration | Measure subprocess/I/O/watcher/concurrency behavior; WASM does not remove host I/O latency or lifecycle races | Poor fit |
| Credentials, policy, durable execution | AX Trust / AX Agent ownership contracts | No migration into Desktop | Preserve canonical services and API boundaries | Out of scope |
| Hashing/compression/media | Native Node crypto and existing platform/library paths | No demonstrated new kernel worth migrating | Reuse native/browser implementations; investigate only if attributed CPU measurements identify an actual gap | Low expected value |

## Measurements performed

All numbers are local synthetic medians, not app-wide improvements. Other machine activity was not controlled.
Files named `*.stdout` preserve complete measured output, including counterexamples. Repeated input and narrow language
coverage limit generalization. JSON test input is repeated JSON lines, not a single application JSON document.

### Existing Shiki JS versus WASM

`kernel-probe.mts` uses the installed Shiki engines, the same theme and input, two warmups and seven measured calls.
It times `codeToTokens`, including token object production. It does not exercise Pierre's entire worker/render pipeline.

| Fixture | JS median | WASM median | Interpretation |
| --- | ---: | ---: | --- |
| TypeScript, 4,500 characters | 5.10 ms | 5.76 ms | WASM slower in this sample |
| TypeScript, 45,000 characters | 50.11 ms | 52.53 ms | No useful win |
| TypeScript, 180,000 characters | 203.70 ms | 205.61 ms | Essentially similar; no established win |
| JSON lines, 2,500 characters | 1.19 ms | 0.94 ms | Small WASM win, about 0.25 ms |
| JSON lines, 25,000 characters | 7.21 ms | 8.77 ms | WASM slower in this sample |
| JSON lines, 100,000 characters | 29.39 ms | 35.66 ms | WASM slower in this sample |

Token hashes matched for these six fixtures only. This does not establish parity for all grammars, custom themes,
long lines or malformed input. Single-process initialization was also logged, but JS ran first and imports/caches
were shared; **do not treat those initialization numbers as a fair cold-start comparison**.

The repository has a stale explanatory comment in `DiffWorkerProvider.tsx:70` saying packaged workers cannot compile
WASM. Current `desktop-renderer-protocol.js:104-118` and web `response-headers.js:56-72` permit `wasm-unsafe-eval`.
That resolves the source-level contradiction, but does not certify the actual packaged Shiki worker asset-loading path.
No CSP widening to `unsafe-eval` is required or proposed. Large-content degradation in `PierreDiffViewer.tsx:505-526`
uses JS string length despite the byte-oriented constant/comment; do not interpret that threshold as exact UTF-8 bytes.

### Current Markdown implementation

`markdown-probe.mts` calls the production responder directly, with one warmup and four measured iterations. It includes
block projection and parsing, so its timing is **not parser-only attribution**. Append means adding four characters.

| Fixture | Initial response | Append response | Key implication |
| --- | ---: | ---: | --- |
| Many blocks, ~16k characters | 32.49 ms | 0.37 ms | Small incremental suffix is already cheap |
| Many blocks, ~100k characters | 176.70 ms | 0.84 ms | Initial parse deserves profiling |
| Many blocks, ~500k characters | 869.44 ms | 2.56 ms | Cold/full workload remains substantial |
| Open code fence, ~16k characters | 1.29 ms | 1.27 ms | Mutable tail is reparsed |
| Open code fence, ~100k characters | 7.87 ms | 7.80 ms | Incremental benefit depends on structure |
| Open code fence, ~500k characters | 42.74 ms | 42.17 ms | Long unfinished tail is a relevant workload |

The ~16k samples are below the production Worker threshold of 16,384 code units; they exercise the responder kernel
only, not the hook's actual routing. The ~500k many-block fixture generates 16,950 blocks; downstream UI work may
exceed parse work and was not measured. Finalization is a future required fixture, not a measurement claimed here.

The existing streaming benchmark's 73,500-character sample returned 3,001 full blocks versus 2 suffix blocks:
JSON size 2,511,889 versus 1,741 bytes; structured-clone proxy 34.34 versus 0.019 ms. This illustrates the value of
already-implemented stable-prefix transfer. It is not a new improvement from this review, nor an IPC timing.

WASM parser replacement must preserve GFM, math, references that invalidate earlier blocks, offsets, unfinished
surrogate pairs, malformed input behavior and stable-prefix revisions. Returning HTML instead of MDAST would change
ReactMarkdown's filtering/custom-component contract and is not a drop-in optimization. HAST conversion, KaTeX and
React/DOM work still need separate treatment. Some transformation stages can technically run outside the DOM; they
should not all be classified as intrinsically DOM-dependent.

### Fuzzy search and streaming alternatives

Direct Fuse proxy at 1k/10k/50k items measured rebuild versus reuse medians of 4.09/3.90, 39.71/38.58 and
200.97/193.76 ms. Index reuse alone did not remove query-scanning cost in this synthetic corpus. This benchmark does
not include the production substring-priority path, top-N sorting, UI work or Worker overhead.

More importantly, `CommandPalette.tsx:626` asks for **10 file hits** from the existing runtime-backed search;
commands, supervision and settings ranking use `noFuzzy: true`. Session matching can use Fuse, but actual session
counts and latency must be measured. A 50k-item synthetic benchmark is not evidence that the current file palette
needs WASM, and must not justify a second repository index in Desktop.

The existing sync benchmark measured 500-turn full projection at 1.779 ms versus incremental 0.019 ms, and display
normalization at 0.091 versus 0.004 ms. The same run's 8,000-message delta batch was **slower** than its sequential
comparison (0.127 versus 0.088 ms), while smaller cases favored batching. Preserve these workload-dependent results;
do not turn a single synthetic speedup into a blanket statement. None compared sync JS with WASM.

## Stability assessment

Most reliable gains come from **bounded work and lifecycle control**, independent of implementation language.
The Markdown client already has 16 pending jobs, 4,000,000 retained input code units, a 1,000,000-per-input cap,
timeout/restart, three-failure cooldown and stale revision checks. WASM should fit this envelope, not bypass it.

A WASM trap can be surfaced as a host exception, but does not make the whole app crash-proof. JS already executes
inside the renderer sandbox. WASM does not fix retained references, wrong response ordering, infinite loops, host
callbacks, unbounded allocation or races. Linear-memory bounds are not per-object memory safety for unsafe C/C++.
If a new owned kernel is necessary, favor a memory-safe implementation and explicit bounds; audited existing upstream
implementations may still be preferable to a custom rewrite. Restarting a Worker after an untrusted failure is a
conservative application policy, not a claim that every WASM trap irreversibly corrupts an instance.

Keep the execution off the main thread: a synchronous WASM call can still block paint. A deadline on the blocked thread
cannot preempt it. Worker termination can interrupt compute but cannot undo external side effects. Kernels should be
pure, with capability-minimal imports and validated sizes/offsets/output. Track JS heap, WASM memory and process RSS
separately; a smaller JS heap alone does not demonstrate lower total memory. Recreate instances to reclaim excessive
high-water allocations when appropriate, and refresh typed-array views after memory growth.

Existing Mermaid makes this distinction explicit: the Worker can be terminated, but official DOM rendering cannot
be forcibly interrupted by its timeout. A WASM layout kernel would not automatically fix that host-side limitation.

## Proposed experiment and adoption gates

1. **Capture representative packaged traces first.** Long session open, streaming Markdown with many completed blocks,
   a long unfinished fence/table, finalization/reference rewrites, large/fragmented diff, project switches and terminal
   output. Separate runtime/network wait, queue time, CPU, transfer, React commit and paint. Record p50/p95/p99,
   >50 ms main-thread tasks, first-paint/cold readiness, total memory, and cancellation recovery. Compare warm and cold.
2. **Use three variants.** Current implementation; optimized JS in a bounded Worker; WASM in the same Worker/protocol.
   Include UTF encoding, copies, output reconstruction and actual Worker round trips. Preserve incremental suffixes;
   do not resend whole documents/results merely because a kernel is WASM. Avoid one ABI call per token/node/cell.
3. **Benchmark relevant semantics and failure paths.** Unicode/CJK/emoji/lone surrogates, huge lines, CRLF/no final newline,
   malformed/nested Markdown, GFM/math/references, hunk identity/revert/stage and selection anchors, custom grammars,
   late responses, compile/load failure, traps, resource exhaustion, worker termination and rapid project switching.
   No persistence or editing side effect may be based on stale result revisions.
4. **Suggested decision threshold, not current policy:** at least 25% lower end-to-end p95 for the targeted slow flow
   against the optimized JS variant; no common-path p50 regression above 5%; memory peak growth no more than 10%;
   stable memory plateau in a soak; bounded cancellation/fallback; all semantic fixtures accepted. Set explicit cold-load
   and compressed asset budgets before implementing. Microsecond wins with material startup cost do not justify migration.
5. **Package and ownership gates.** Lazy-load pinned same-origin artifacts with reproducible provenance, license/NOTICE
   updates where required, versioned ABI, integrity and MIME checks. Test actual packaged `app://` workers and web mode,
   with current production CSP and supported macOS/Windows/Linux release architectures. Node host success is insufficient.
   Keep JS/plain-text fallback, revision invalidation, rollback and bounded retry. Do not blindly retry poison input via
   another expensive parser on the main thread.
6. **Start single-threaded inside an existing Worker.** WASM threads/shared memory are not necessary for the first pilot.
   SharedArrayBuffer adds cross-origin-isolation requirements in the web platform; do not introduce COOP/COEP changes
   casually across embedded apps, previews, authentication or popup flows. Measure before adding SIMD/threads complexity.
7. **Only then propose implementation.** For a passing kernel, define accepted ownership/ABI/failure contracts and run
   root boundary, locale, typecheck, lint, test and build gates, plus fresh DOM/screenshot and packaged soak evidence.
   AkiTTY improvements belong in its canonical source, followed by a verified pin update; no Desktop-local terminal fork.

## Reviewer reconciliation

Grok took the stricter position: no new Markdown, fuzzy, Mermaid or sync WASM implementation should be scheduled
from source inspection alone. Muse allowed a conditional Markdown pilot after attribution. Both prioritized the
low-cost upstream Shiki switch as an **experiment**, not a proven improvement. Their initial reports preceded the
local probes and should not be read as endorsements of the final measurements or an implementation approval.
The final recommendation agrees with Grok on no immediate new port, while retaining Muse's Markdown research
candidate because the production responder has measurable expensive input shapes. A WASM parser remains gated
on real packaged attribution and a complete JS-versus-WASM comparison; those gates have not passed.

Grok's raw report also conflates highlighting with hunk computation in places. These are separate kernels: the
final report does not infer hunk correctness or diff speed from matching Shiki token hashes. AkiTTY's old pinned
commit is evidence of the current import, not a directive to freeze future upstream upgrades at that commit.

Muse's initial lowest-cost candidate was the existing Shiki WASM option. That was a reasonable experiment order, but
the subsequent measurements do not justify enabling it by default. Markdown now has concrete local workload costs,
while its WASM benefit remains unproven. Pure diff/hunk work needs separate attribution from highlighting.

Do not adopt several overly broad statements from the advisory text: not every WASM boundary requires UTF-8 (UTF-16
ABIs are possible); not every AST/HAST/KaTeX stage requires a live DOM; returning every whole document is inferior to
preserving this repository's incremental protocol; a WASM trap is not intrinsically irreversible instance corruption;
and future runtime delegation still has transport costs. These qualifications are part of the final assessment.

## Reproduction and sources

From repository root:

```sh
pnpm run bench:sync-hotpath
pnpm exec tsx .internal/reports/wasm-review-20261103/kernel-probe.mts
pnpm exec tsx .internal/reports/wasm-review-20261103/markdown-probe.mts
pnpm --dir desktop/packages/ui run test src/components/chat/markdownWorkerParser.test.ts src/components/chat/markdownWorkerClient.test.ts src/components/chat/PreparedMarkdown.test.tsx src/components/views/useDiffHunkRevert.test.tsx
```

The scripts only read/import current project code and write results to stdout. The evidence snapshot includes raw
reviewer outputs, prompts and receipts; `run-reviewers.py` records the initial invocation setup with its original
temporary output directory. The temporary probe first encountered an ESM-only package resolution error; the retained
probe resolves the dependency package by realpath and the recorded final run completed. No dependency was changed.

Primary documentation consulted on 2026-11-03:

- [Shiki regex engines](https://shiki.style/guide/regex-engines): JS can be faster for some languages and avoids the
  Oniguruma WASM payload. Installed 4.5.0 code, not current documentation version, determined the available option.
- [WebAssembly security model](https://webassembly.org/docs/security/): sandbox, traps, and remaining linear-memory/race risks.
- [MDN CSP](https://developer.mozilla.org/en-US/docs/Web/HTTP/Reference/Headers/Content-Security-Policy): distinct WASM compilation policy.
- [MDN SharedArrayBuffer](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/SharedArrayBuffer): shared-memory isolation requirements.

No source code, dependency, CSP or runtime pin was changed. No commit, push or release was performed.

Raw logs and source packets with significant trailing whitespace are stored as `.gz` to preserve their exact bytes.
Read them with `gzip -dc <file.gz>`; the remaining evidence is plain text.
