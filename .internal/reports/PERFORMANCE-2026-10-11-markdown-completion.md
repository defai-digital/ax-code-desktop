# Markdown streaming completion and Rust adoption decision

## Outcome

Keep the production JavaScript worker. The native Rust prototype does not meet
the proposed 30% end-to-end p95 improvement gate: after projection, native
serialization, IPC, position/math adaptation and real component rendering, the
paragraph case regresses and the block case improves only modestly. Rust remains
a benchmark tool; no production native binary, IPC, preload capability, CSP,
package/runtime pin or release policy change is introduced.

Ship completed-block reuse in the existing JS worker and renderer instead. In
the accepted replay, request-to-Chromium-paint p95 falls from 322.74 to 37.03 ms
for the paragraph-prefix stream and from 486.04 to 56.98 ms for the 6,000-block
prefix stream. This completes the identified incremental parsing/rendering work
and the Rust go/no-go evaluation, not every possible GUI optimization.

## Production implementation

`createMarkdownWorkerParser` keeps only the most recent successful live source,
its incremental lexer state, and ASTs for its completed prefix. Append-only
updates in the same message reuse unchanged full blocks; the live tail always
parses again. Message changes, rewrites/truncations and finalization invalidate
reuse. Reference/footnote definitions retain the existing whole-live-block
fallback, so earlier content is not reused across that interpretation change.

Completed raw/source strings are detached from prior request buffers by copying
UTF-16 units. This avoids sliced strings retaining a sequence of whole historical
snapshots and preserves unfinished surrogate pairs. The old live-tail AST is not
retained. Existing one-million-character input limits, bounded scheduling and
five-second watchdog remain unchanged; terminating the worker releases its cache.
This is one previous-source cache, not a transcript or per-project history cache.

The hook rehydrates matching full blocks before storing a worker result. This
retains AST/object identities despite structured cloning, avoids re-rendering
completed components, and prevents state from keeping fresh duplicate ASTs beside
the stable render projection. Matching requires full mode, identical key, raw and
healed source, matching plain status and a prepared tree. Live blocks and exact
finalization still receive their new results.

Packaged `app:` pages now omit DuckDuckGo favicon URLs that the existing `img-src`
policy already blocks. The external link target and browser/dev favicon behavior
are retained. This avoids rejected image loads and error-driven component updates
without broadening CSP. The link-heavy replay records 1,200 rejected favicon
loads before the change and zero afterward.

## Rust compatibility experiment

The benchmark-only adapter supplies math HAST metadata, converts UTF-8 offsets
and all descendant positions into UTF-16 coordinates, adjusts list/footnote end
spans and escaped-text starts, and normalizes multiline inline math. A direct
native audit and captured-fixture regressions cover 25 inputs: GFM tables/tasks,
links, footnotes, Unicode/entities, LF/CRLF/CR, math and multiline math, nested and
loose lists, escaped punctuation, code/Mermaid fences and unsafe HTML/URLs.

For these fixtures, adapted ASTs match the existing parser after omitting null
optional fields, including positions and math metadata, and static output through
the real `PreparedMarkdown` component matches. This closes the compatibility
differences identified in the first experiment; it is not exhaustive qualification
of every grammar input or native distribution platform.

## Accepted Electron replay

The archived harness builds production Vite/React-compiler/minified output and
uses Electron 42.5.2 / Chromium 148.0.7778.271 with the production packaged
`app://ax-code` protocol handler and unchanged CSP. It renders the actual
`MarkdownRenderer`, theme and i18n components with inert runtime/sync contexts.
No real project, model, signed AX Code worker or runtime API is invoked.

Each scenario uses a fresh window and independent temporary user-data directory.
Thirteen append-only publications retain a roughly 200 KB prefix and add unique
revision markers. The first three updates are excluded from steady p95; ten
remaining samples determine the reported p95. Native keys are sent every 150 ms
to a fixture textarea, with 300 ms of event drain before validation. This is not
the actual ChatInput or end-to-end keyboard latency measurement.

The JS baseline is loaded from `2835ca9` for the parser, worker entry, hook and
favicon helper in both page and worker builds. The Rust path replaces only the
parser worker transport with an isolated preload/main bridge and background Node
worker; projection/healing, native parsing, complete AST transfer and adaptation
all execute off the UI thread. The bridge is lazy and the cold sample includes
its startup. The background process is killed when disposing the fixture.

Benchmark-only layout effects mark formatted commits and scroll the revision into
view. Chromium tracing records source-publication marks, commit marks and the
first same-thread `Paint` event after the formatted commit. The reported metric
ends at that paint event's completion, not OS/GPU presentation. The final marker
must be visible within the viewport, all 13 revisions must format, the expected
worker path must run, and every received key must appear in the textarea.
The legacy `firstFormattedPaintP95Ms` field in raw data is a separate DOM/two-RAF
proxy; the decision uses `requestToChromiumPaintP95Ms`.

This uses the documented [Electron debugger transport](https://www.electronjs.org/docs/latest/api/debugger)
and [Chromium tracing protocol](https://chromedevtools.github.io/devtools-protocol/tot/Tracing/).
These are paired single-host measurements on a normally running macOS desktop,
not universal GUI/FPS guarantees. Instrumentation adds a small commit-hook cost.
Exploratory runs without visible-tail validation or with noisy blocked external
favicons were excluded from the accepted comparison.

| Steady request-to-paint p95 | Prior JS | Rust prototype | Shipped JS candidate |
| --- | ---: | ---: | ---: |
| 211 KB paragraph prefix + appended tail | 322.74 ms | 403.09 ms | 37.03 ms |
| 204 KB / 6,000-block prefix + appended tail | 486.04 ms | 445.03 ms | 56.98 ms |
| Small Markdown | 12.91 ms | Not selected | 6.77 ms |
| 600 external links + appended tail | 46.86 ms | Not selected | 12.66 ms |

The large-case observer windows record 13 renderer tasks over 50 ms in the prior
JS path, 26 in the Rust path, and one in the candidate JS path. Initial
parser/module loading and complete finalization are not eliminated.
Caching does not accelerate a single continually growing live block. Interleaved
messages invalidate this one-source worker cache, although each renderer can
still reuse its matching completed ASTs.
DOM size is retained and this change does not virtualize Markdown within a body.

Raw samples, gzip-compressed trace markers/paint events and screenshots are archived under
[markdown-completion-2026-10-11](markdown-completion-2026-10-11/). Candidate paragraph
and block screenshots were visually inspected; the full source and final revision
remain accessible. All accepted runs have no captured runtime exceptions and
retain every received input character. The existing protocol's invalid IPv6 CSP
source warnings are independent of these changes and remain unchanged.

## Validation scope and reproduction

Unrelated locale work appeared concurrently in the original checkout. Validation
therefore ran in an isolated worktree at `2835ca9` with only this patch, sharing
the installed dependencies. The original locale/reference changes were preserved.
The dependency symlinks and temporary web fixture are not committed. This evidence
does not validate another writer's unfinished locale modifications.

See the [experiment README](../experiments/markdown-rust/README.md) for native
build/audit commands and the Electron harness reproduction procedure. The native
lockfile and release binary are unchanged from the first experiment.

Completed verification:

- Direct native executable audit: all 25 adapted AST/markup cases passed.
- Focused parser, lifecycle, native adapter, rendering and URL regressions:
  60 passed, including UTF-16/CRLF preservation and cloned-response identities.
- Full workspace tests: 2,897 passed, one skipped.
- Workspace typecheck and lint passed on the final patch.
- Production desktop build passed (three tasks, no cache hits).
- Boundaries and shadow-only release identity contract passed.
- Built production renderer JavaScript contains none of the prototype bridge,
  channel or native executable identifiers.
- Temporary web fixture was removed and all benchmark subprocesses exited.

No public package, release, push or native platform qualification was performed.
