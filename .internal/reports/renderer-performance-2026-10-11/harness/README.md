# Controlled Electron renderer profiling harness

Historical baseline/candidate artifacts were produced before the production fix
on source revision `f7ef106080626eb658921a043dbe58219cdce91a`. The candidate builder
expects the old memo expression and intentionally rejects already-patched source.
After applying the fix, use the ordinary builder alone to validate production
source; `applied-results.json` records that replay. To reproduce the historical
comparison, use an isolated checkout of that baseline revision and these harness
files, adjusting the build scripts' absolute checkout paths as needed.
For pre-worker revisions, use the harness files archived in commit `3ec3e95`;
the current fixture also instruments the Markdown worker client.

This harness mounts the actual production MessageList, ChatInput, session-record
subscription, and user-history selector. It uses fixture child-store data, inert
runtime API providers, and a fetch stub. It does not start AX Code or send prompts.
Provider/model selectors show loading placeholders because no real catalog is
loaded. The shell is a separate Electron BrowserWindow, not the complete desktop
portfolio/server/preload environment. Source imports resolve through the ordinary
web Vite configuration, including the React compiler and production minification.

Run from `/Users/akiralam/code/ax-coder-old`. Copy `renderer.html` and
`renderer.tsx` into a temporary `desktop/packages/web/perf/` directory (do not
overwrite an existing directory). Build scripts must run with the web workspace
as the working directory for Babel's compiler-plugin resolution:

```sh
node /absolute/path/to/ax-coder-renderer-build.mjs
node /absolute/path/to/ax-coder-renderer-candidate-build.mjs
```

The second script applies the experimental patch in the Vite load hook, before
React compilation. It does not edit repository production source. The candidate
removes the stale virtual-row memo and opts this one component out of compiler
memoization. It is an experiment, not a reviewed or committed product fix.

Use the pinned Electron executable to run `ax-coder-renderer-run.cjs`:

```sh
AX_PERF_EVIDENCE=/tmp/ax-coder-renderer-live-evidence /absolute/path/to/Electron /absolute/path/to/ax-coder-renderer-run.cjs
AX_PERF_DIST=/tmp/ax-coder-renderer-candidate-dist AX_PERF_EVIDENCE=/tmp/ax-coder-renderer-live-candidate-evidence /absolute/path/to/Electron /absolute/path/to/ax-coder-renderer-run.cjs
```

The runner creates a fresh temporary userData profile, serves the fixture bundle
on a random loopback port, and closes its own window/server on completion. It
sends 79 native key sequences in each 12-second measurement and allows 300 ms for
pending events. Every scenario uses a four-second warmup. Scroll is followed at
record publications and settled before capture. The instrumented input remains
focused; avoid interacting with its window during measurement.

Set `AX_PERF_PACKAGED_PROTOCOL=1` to serve the fixture through the production
`app://ax-code` protocol handler and packaged CSP. The fixture supplies an inert
loopback API-origin projection before imports; its fetch stub still prevents
runtime/model requests. Worker counters distinguish successful off-thread
parsing from a plain-text failure fallback, and formatted strong-node counts
confirm rich Markdown mounted. This mode tests renderer transport, not a signed
installer or the complete packaged application.

Workloads: idle with 200 messages; Markdown at 20 requested updates/second with
200 or 4,000 messages; an 90,000-character paragraph with repeated inline Markdown
that grows without paragraph breaks; and a completed bash tool with one
204,000-character output publication 500 ms into the measurement, tested both
collapsed and expanded. `AX_PERF_SCENARIO` accepts comma-separated scenario names
for selective replay. Tool completion is used because ToolExpandedContent renders
output only for the completed state. `renderedToolOutput` must be true in the
expanded tool result; check the final screenshot as well.

Use `ax-coder-renderer-analyze.cjs /path/to/evidence` to aggregate CPU samples and
main-renderer timeline events. Timeline durations are inclusive and may overlap;
do not add the categories into a single total or treat them as disjoint shares.
Trace collection extends slightly beyond the fixture observer window to include
final instrumentation/capture. Keys use Chrome Event Timing (minimum observable
duration 16 ms, rounded), plus a separate handler-to-later-RAF proxy. The latter
excludes pre-handler queueing and is not an end-to-end input-latency measurement.
RAF gaps indicate renderer scheduling stalls, not exact compositor dropped frames.

Results in the report use the corrected `streaming` phase and valid tool output
payloads. Earlier harness trials with a `text` phase or running/metadata-only tool
output were discarded. The final tool cases were rerun separately because the
completed output must actually be displayed. Initial render and lazy-load cost
are outside the measured warm-streaming interval.
