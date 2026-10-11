# Large tool output rendering

## Problem and change

Completed generic tool output passed the entire source through syntax highlighting and mounted every output line. A 204,000-byte, 4,000-line expanded shell result created approximately 25,000 DOM nodes despite message-history virtualization.

Generic output exceeding 200 lines or containing at least 32,768 characters now uses a shared plain-text virtualized view in the message and output dialog. It mounts the visible lines with six lines of overscan and measures wrapped row heights. React Compiler optimization is disabled for this component because the TanStack virtualizer updates ranges through a stable instance. Source lines are split once per changed output; all content remains available without a display truncation limit.

Copy and download operate on the complete original source, including offscreen lines and CRLF. Text is rendered through React escaping. Changing the tool identity resets the scroll position. Small output retains syntax highlighting. JSON trees and specialized diff, file, search, task, and other tool views retain their existing paths.

## Paired renderer measurement

Both builds used the same production Vite configuration, React Compiler, minification, fixture, Electron 42.5.2 / Chromium 148.0.7778.271, and production `app://` protocol handler and CSP. The baseline loader substitutes only the two output-renderer modules from commit `0984a9ce49b8719187a79f2b9f2fca9b863110f2`; it does not modify working-tree source. The candidate uses the new renderer.

The fixture contains 4,000 message records and an expanded shell output. It publishes one completed 204,000-byte output update during the measurement, rather than pretending to stream completed tool state at 20 Hz. Both runs inject native Electron keyboard events every 150 ms for 12 seconds, followed by a 300 ms drain. The final output row has a unique marker while preserving the source byte count. Runs were sequential without a concurrent build.

| Metric | Baseline | Candidate |
| --- | ---: | ---: |
| DOM nodes | 25,060 | 1,092 |
| Mounted virtualized output rows | 0 (full highlighted output) | 24 |
| Long tasks over 50 ms | 6 | 0 |
| Total long-task time | 490 ms | 0 ms |
| Maximum frame interval | 92.5 ms | 16.8 ms |
| Frame intervals over 50 ms | 6 | 0 |
| Frame interval p95 | 9.2 ms | 9.2 ms |
| Key-to-frame p95 | 15.3 ms | 15.6 ms |
| Received keys / added characters | 79 / 79 | 79 / 79 |
| Renderer errors | 0 | 0 |

After the timed measurement, the candidate scrolls the real output viewport to its bottom. The unique final row is visible with only 24 mounted rows. The screenshot was visually checked. DOM nodes decreased about 96%; long stalls disappeared in this fixture. Input p95 was effectively unchanged. These are paired single-run observations, not statistical guarantees or a claim that every GUI interaction is now fast.

Raw metrics, the final-row screenshot, and baseline builder are in [tool-output-2026-10-11](./tool-output-2026-10-11/). The updated fixture and runner are in [renderer-performance-2026-10-11/harness](./renderer-performance-2026-10-11/harness/). CPU profiles and traces remain temporary diagnostics rather than committed large artifacts.

## Validation

- Five focused regressions cover mounted-range replacement on a stable virtualizer, escaped text, complete copy, complete download and cleanup, changed output and identity, trailing newline, and eligibility thresholds.
- Full workspace suite: 2,848 passed, one skipped. The focused suite was rerun after moving pure helpers into their own module.
- Workspace typecheck, lint, and ownership/boundary checks passed.
- Production desktop build passed.
- Real production-compiled Electron renderer test passed, including the final-row scroll check and zero renderer errors.

## Limits and follow-up

Large generic output deliberately gives up whole-source syntax highlighting. Browser find and native text selection see mounted rows; full-source copy and download remain available. A single enormous wrapped line can still require expensive layout, and full-source splitting and copy remain proportional to source size. Large JSON trees and specialized tool views are separate potential hot paths. Dynamic row measurement follows the [TanStack Virtual API](https://tanstack.com/virtual/latest/docs/api/virtualizer).

This change stays within the existing Electron UI and does not change runtime ownership, credential handling, runtime pins, or release policy. No native rewrite is needed to remove this DOM and highlighting cost.

## Reproduction

Copy the archived `renderer.html` and `renderer.tsx` into a temporary `desktop/packages/web/perf/` directory. From `desktop/packages/web`, run the baseline builder and the existing `ax-coder-renderer-build.mjs`; their output directories are `/tmp/ax-coder-tool-output-baseline-dist` and `/tmp/ax-coder-renderer-dist`. Remove the two temporary fixture files and directory before the ordinary desktop build.

Run `ax-coder-renderer-run.cjs` with the pinned Electron executable, `AX_PERF_SCENARIO=tool-expanded-4000`, and `AX_PERF_PACKAGED_PROTOCOL=1`. Set distinct `AX_PERF_EVIDENCE` directories and use `AX_PERF_DIST=/tmp/ax-coder-tool-output-baseline-dist` for the baseline. Leave `AX_PERF_DIST` unset for the candidate. The builders and runner currently contain this checkout's absolute path; adapt it for another checkout. No live project, credentials, or worker runtime is required.
