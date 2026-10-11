# JSON tree construction performance

## Change

The tool-output JSON probe and dialog already produce parsed JSON values. `JsonTreeViewer` previously serialized those values and parsed them again before building the tree. It now builds directly from parsed values, preserving their references rather than retaining a second decoded object graph.

The tree builder now keeps its node budget local to each invocation, indexes arrays directly instead of allocating an entry tuple for every element, and stops visiting children when the existing node limit is reached. The existing 100,000-node and depth-50 limits, node paths, child counts, and expansion behavior remain. Object keys still require enumeration. The direct API consumes parsed JSON, not arbitrary class instances requiring JSON serialization normalization.

Collapsed object previews now slice the three displayed children before mapping their keys. The tree viewer disables React Compiler memoization for its stable TanStack virtualizer instance, matching the message-list and large-output safeguards. This paired renderer test did not reproduce a baseline scrolling failure; the directive is a precaution verified by a stable-instance regression.

## Construction measurement

The archived benchmark imports the historical utility from commit `13e4263` and the current utility in the same Node process. Historical construction includes the viewer's stringify/parse round trip. Candidate construction uses already-parsed data. Both receive the same values, have one warmup, and run nine timed iterations with alternating order. Reported values are medians; fixture generation is outside the timed operations.

| Fixture | Source bytes | Retained nodes | Baseline median | Candidate median |
| --- | ---: | ---: | ---: | ---: |
| 4,000 nested records | 592,106 | 96,001 | 20.86 ms | 21.61 ms |
| 1,000,000 numeric array entries | 6,888,891 | 100,000 | 85.05 ms | 13.64 ms |

The oversized array construction improves approximately 84% because the builder stops at the retained-node budget. The ordinary nested fixture has no demonstrated speedup. These measurements isolate construction in Node; they do not represent complete Electron interaction latency or native-memory measurements.

## Electron renderer validation

The production-compiled fixture uses the real message list, input, stores, and output tree under the production `app://` protocol handler and CSP. Baseline and candidate are built with the same compiler and configuration; the baseline substitutes only the historical tree utility and viewer, with row attributes added for inspection. The fixture publishes one completed 592,106-byte JSON output in a 4,000-record chat. It does not claim 20 Hz completed-output streaming.

| Timed metric | Baseline | Candidate |
| --- | ---: | ---: |
| DOM nodes | 1,371 | 1,371 |
| Mounted JSON rows | 39 | 39 |
| Long tasks over 50 ms | 0 | 0 |
| Frame p95 | 9.2 ms | 9.2 ms |
| Key-to-frame p95 | 15.6 ms | 15.9 ms |
| Received keys / added characters | 79 / 79 | 79 / 79 |
| Renderer errors | 0 | 0 |

Both runs reached the last array entry and mounted its expanded fields. An additional candidate validation run scrolls after expansion and checks that the final record's name lies inside the output viewport. This visibility run received 83 native key events and added 83 characters; its timing data is not used in the paired table. The screenshot was visually reviewed. The GUI fixture confirms behavior and shows no material input-latency improvement; the useful measured gain is the oversized-array construction path. Renderer timings are paired single runs.

## Checks and limits

- Six new regressions cover retained references and paths, exact array reads under a node budget, depth limits and counts, reentrant construction, malformed text/cycles/shared subtrees, and visible-range replacement on a stable virtualizer.
- Full workspace tests: 2,854 passed, one skipped.
- Workspace typecheck, lint, boundary checks, and production desktop build passed.
- Runtime ownership, SDK/runtime pins, Electron, and shadow-only release policy are unchanged.

Initial JSON text parsing still runs on the UI thread. Tree construction below the cap is proportional to retained nodes, and expanding the entire retained tree still needs flattening. The pre-existing node cap can omit later tree entries; this change does not introduce a new display cap or change the source output. No claim is made that all JSON costs are now eliminated.

## Evidence and reproduction

[json-tree-2026-10-11](./json-tree-2026-10-11/) contains the benchmark, raw timings, renderer metrics, screenshot, and baseline builder. Run `pnpm exec tsx .internal/reports/json-tree-2026-10-11/benchmark.mts` from the repository root.

For the renderer, copy the archived `renderer.html` and `renderer.tsx` from `renderer-performance-2026-10-11/harness/` into temporary `desktop/packages/web/perf/` files. From the web package directory, run the JSON baseline builder and the existing renderer builder. Remove the temporary fixture files before running the ordinary desktop build. The builders currently contain this checkout's absolute path; adapt it for another checkout.

Use the pinned Electron executable to run the archived runner with `AX_PERF_SCENARIO=json-tool-expanded-4000` and `AX_PERF_PACKAGED_PROTOCOL=1`. Give each run a distinct `AX_PERF_EVIDENCE` directory. The baseline uses `AX_PERF_DIST=/tmp/ax-coder-json-tree-baseline-dist`; the candidate uses the default `/tmp/ax-coder-renderer-dist`. No live project or worker runtime is required.
