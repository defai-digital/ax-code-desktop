# Markdown Worker optimization and CRLF streaming repair

Date: 2026-11-03. Baseline Desktop commit: `86fed71500347e9878219c2b98d23abd52d7f8f8` (7.30.12).
Companion: [selective WASM assessment](../wasm-review-20261103/README.md).

## Authorized plan and implemented scope

The user requested planning and implementation with Grok CLI and Muse CLI, followed by testing and a commit.
They also identified `~/code/ax-code`'s existing diff implementation as a possible reuse source.

1. Inspect the canonical diff implementation and public consumption boundary before considering a Desktop kernel.
2. Attribute current Markdown costs and prefer a smaller JS/Worker improvement when no WASM migration passes its gates.
3. Remove redundant block-projection work while preserving remark/MDAST rendering, revision checks, reference fallbacks
   and Worker recovery. Reproduce and repair any confirmed correctness issue in that path.
4. Review the patch with both real CLIs, verify regression/parity behavior, exercise the actual Electron Worker and DOM,
   run root gates and commit the scoped result. No push or release was requested.

This implementation stays within existing Desktop-owned parsing/rendering. It changes no SDK/runtime ownership,
IPC/Worker wire contract, accepted PRD/ADR/spec, dependency, runtime pin, terminal import, or security permission.
A new architecture/source-ownership proposal is therefore unnecessary for this bounded implementation.

## Changes

- **CRLF cache correctness:** marked produces LF-normalized token raws. Previously, `stablePrefixLength` counted those
  normalized characters while the cache retained original CRLF input. On a sufficiently long stable prefix, slicing
  the original text at that shorter offset repeated already-rendered blocks. The cache now compares, stores and slices
  LF-normalized text. Reference-definition and malformed-input whole-text fallbacks still retain their existing raw
  source behavior. Split CRLF chunks, rewrites and stable block identity are covered.
- **Avoid duplicate inline parsing:** block projection consumes only marked token `type` and `raw`; remark owns the
  actual inline AST. Use the public `Lexer.blockTokens` entry point rather than running and discarding marked's inline
  tokenization. Full marked token boundaries remain the parity oracle in regression tests.
- **Own lexer lifetime:** a new `Lexer()` alone is insufficient isolation: installed marked shares default options and
  a tokenizer whose `lexer` field points back to the latest instance. Each projection now creates independent options
  with a fresh tokenizer and empties its skipped inline queue. A regression ensures another lexer's tokenizer is not
  redirected through global defaults. No custom Markdown parser was introduced.
- **Fence inspection:** find the final line with `lastIndexOf`/`slice` instead of allocating an array of every code line.
  The previous trailing-whitespace and closing-fence rules are retained.
- **Native journey:** `markdown-stream-webmcp.mjs` opens the isolated fixture conversation through native WebMCP,
  injects renderer-only stream events, observes real Markdown Worker requests/responses, verifies exactly 40 ordered
  headings through CRLF append/finalization, and captures both themes. No model call or live runtime mutation occurs.

Product changes are in `desktop/packages/ui/src/components/chat/markdownStreamBlocks.ts`; adjacent tests cover the
behavior. The new Electron journey and `docs/development-webmcp.md` make the UI check repeatable.

## AX Code diff reuse finding

The user's correction prompted a fresh read after canonical commit
`912c8f92c4d66d0ad8a2887251c3325bbf8b5718` landed. **The WASM engine now includes `diff`, `applyHunks`,
`applyPatch` and duplicate comparison.** The initial duplicate-only observation was a snapshot of work in progress
and is superseded. The native package also provides edit matching, similarity, statistics and unified diff APIs;
Desktop does not need to reimplement the shared preview/patch kernels.

The revised recommendation is to reuse this canonical engine for a future qualified diff compute adapter. Its browser
entry point already owns a bounded, cancellable module Worker, so wrapping synchronous code in another ad hoc worker
is no longer the preferred first step. Current delivery and semantic integration details are in
[the canonical diff integration plan](canonical-diff-plan.md). The Markdown fix in this commit is independent.

Read-only GitHub checks confirmed the source commit is remote and the subsequent CLI 7.30.15 / SDK 2.6.68 preparation
commit was pushed with CI pending/in progress. At the recorded check, neither release existed yet, the remote WASM
manifest still declared private version 0.1.0 with a workspace util dependency, and the visible organization npm package
list contained no diff package. This establishes source availability, not an independently installable browser artifact.
GitHub Packages or a versioned GitHub Release tarball are both acceptable delivery channels; npmjs is not required.
The timestamped evidence is in `diff-update/github-check.json` and its sibling outputs. No sibling file was changed.

## Reviewer record and reconciliation

- Muse completed the initial plan review. It recommended block-only lexing with parity checks, rejected batching blocks
  into a new semantic mapping layer and rejected a handwritten incremental fence parser.
- Grok's initial plan invocation timed out after 360 seconds with no output; it is unavailable evidence, not approval.
- Both CLIs then completed a compact implementation review with exit 0 and no concrete requested correction. Their
  packets covered the CRLF, block-only and last-line changes.
- Independent local verification subsequently disproved their overly broad assertion that a fresh default lexer alone
  isolates its queue: two default lexers shared options and tokenizer. The final lifetime fix and regression were sent
  to both reviewers as a separate focused addendum. Both completed with exit 0 and found no production defect in
  the corrected ownership. Grok noted that the regression fixture itself retained a shared lexer; its `finally`
  now clears the test queue and restores the previous default tokenizer/backreference. Their conditional concern
  about a global-lexer fallback does not apply: this fallback builds a whole live block through remend, not marked.
  Preserve these distinctions rather than treating advisory approval as proof of correctness.

Raw English prompts, outputs, receipts and readable reviews are in `plan/`, `review/` and `final-review/`.
Both CLIs also completed the updated canonical-diff integration review (exit 0; Muse 29.20 s, Grok 132.34 s).
They supported canonical reuse and called out async scheduling, hunk identity, inverse/subset semantics and packaging.
Their claims are qualified by local evidence: the existing CSP already permits WASM compilation; a registry is not the
only valid delivery channel; and coordinate adaptation is not automatically a forbidden runtime fork. Prefer a canonical
helper where semantics would otherwise be duplicated, and prove any host mapping through parity tests. The current
artifact status comes from timestamped GitHub queries, not from inferring availability from `private: true` alone.
Reviewer source packets are bounded advisory evidence, not independent app profiling or release certification.

## Measurements and limits

The baseline probe separated marked lexing from remark. For a roughly 500k many-block fixture it measured full marked
lexing at 95.39 ms, block-only lexing at 44.00 ms, whole-document remark at 1567.14 ms and per-block remark at 856.83 ms.
For a ~512k open fence, marked took 0.68 ms while remark took 49.51 ms. These preliminary values identified the work;
they do not justify replacing the fence parser or combining every block into one remark parse.

`compare.mts` checks full initial response equality on LF fixtures and compares the immutable baseline against current
source with the same installed dependencies. It measures block projection, fresh response, append, finalization and a
structured-clone proxy. The final harness alternates variant order, optionally forces GC outside measured work, and
records five samples after one warmup. These are Node kernel/projection measurements, not browser latency percentiles.

Earlier non-interleaved runs overlapped local verification or showed substantial drift even in unchanged reference and
finalization paths. They are retained as diagnostics and must not support an app-wide speed claim. The workstation
also had concurrent unrelated workload (observed load averages approximately 25/30/25); no other task was stopped.
The demonstrated correctness improvement and elimination of redundant inline work do not depend on those noisy timings.
No WASM implementation was qualified or adopted, and no end-to-end 25% improvement is claimed.

Final interleaved run (milliseconds; block projection includes lexing/healing/key construction):

| Workload | Projection baseline -> current | Whole fresh response baseline -> current |
| --- | --- | --- |
| Small inline document, 3,724 characters | 0.607 -> 0.218 | 14.338 -> 14.020 |
| Many blocks, 100,304 characters | 10.561 -> 2.814 | 260.719 -> 269.514 |
| Many blocks, 501,504 characters | 40.610 -> 10.544 | 894.557 -> 856.262 |
| Open fence, 512,514 characters | 1.464 -> 1.245 | 61.587 -> 65.236 |
| Reference fallback, 9,932 characters | 0.187 -> 0.186 | 20.266 -> 20.547 |

The targeted many-block projection improves substantially, but the full response does not consistently improve.
That is why this ships as a correctness fix and removal of redundant work, not a claimed solution to all large-document
latency. The unchanged remark-heavy paths remain future profiling candidates. Raw append/final/clone measurements,
including regressions/noise, are retained in `comparison-interleaved.stdout`.


## Verification

The new tests initially reproduced three failures: CRLF stable-prefix duplication, split-CRLF incremental mismatch,
and redundant inline-token execution. Subsequent focused runs passed, including the final tokenizer ownership guard.
Existing malformed-input, references, GFM/math, owner/revision/finalization, recovery and plain-text fallback coverage
was retained. All six required root gates passed on the final production implementation: boundaries, locales,
typecheck, lint, test and build. Tests: **8,987 passed, 12 skipped** (root 253; AkiTTY 502; Electron 1,226;
UI 5,450; web 1,556). The final focused run passed 60 tests across five files; UI type-check also passed.
`final-gates/gates.json` records exit codes and durations; sibling logs preserve full output.

The Electron journey passed boot, Markdown stream, CSP and renderer exception checks. Its real Worker handled
23,761 characters, reused 80 stable blocks while parsing the appended tail, and completed a final parse. DOM reads
verified all 40 headings in order and the appended marker. Both theme screenshots were inspected. The first journey
attempt exposed a harness readiness race (project rows appeared before their conversation controls); the journey now
waits for the actual native control, then passed without a product change. `native/` retains both attempts' outcomes,
the successful Worker/DOM receipt and screenshots. This is a fixture smoke test, not an app-wide benchmark.

The implementation commit is the commit adding this report; resolve it with
`git log -1 --format=%H -- .internal/reports/markdown-optimization-20261103/README.md`.

Reproduce from the repository root:

```sh
pnpm --dir desktop/packages/ui run test src/components/chat/markdownStreamBlocks.test.ts src/components/chat/markdownWorkerParser.test.ts src/components/chat/markdownWorkerClient.test.ts src/components/chat/useMarkdownBlocks.test.tsx src/components/chat/PreparedMarkdown.test.tsx
pnpm exec node --expose-gc --import tsx .internal/reports/markdown-optimization-20261103/compare.mts 86fed71500347e9878219c2b98d23abd52d7f8f8
pnpm run check:boundaries
pnpm run check:locales
pnpm run typecheck
pnpm run lint
pnpm run test
pnpm run build
node desktop/packages/electron/scripts/e2e/markdown-stream-webmcp.mjs --artifacts /tmp/ax-markdown-stream
```

The comparison reads historical tracked source with `git show`, creates only its own temporary module directory,
uses existing installed dependencies, then removes that temporary directory. It does not reset the checkout.
Native fixtures qualify local Electron behavior only; Windows/Linux, signed packaging and deployed version performance
remain outside this source commit. No publication is implied.

Raw logs and source packets with significant trailing whitespace are stored as `.gz` to preserve their exact bytes.
Read them with `gzip -dc <file.gz>`; the remaining evidence is plain text.
