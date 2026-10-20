# Desktop session soak v1: a 10-minute accelerated growth check

Status: Accepted for implementation under PRD-2026-10-19-trusted-supervision-v1 (Phase B item 7, revised to 10 minutes).
Reuses the launch, CDP and stub-runtime pieces of SPEC-2026-10-19-desktop-e2e-harness-v2. Advisory only: it is not a merge or
release gate.

## Question

Does the renderer keep growing when it processes a long, busy, bounded workload? The workload creates and removes the same
kinds of state over and over, so any steady growth after warm-up is retained memory, listeners or DOM that nothing releases.

## Method

`desktop/scripts/renderer-soak.mjs` launches the built app in an isolated profile against the stub runtime (the same launcher
the end-to-end harness uses), opens the main renderer over CDP and drives a scripted workload through the renderer's own
event socket as synthetic frames, as `renderer-trace.mjs` does. Nothing reaches a real runtime or model.

- Cycle (repeated at a fixed rate for the whole run): create a session, stream a message with text parts and deltas, add and
  resolve a permission request, publish a `session.goal` event, then remove the message and delete the session. Each cycle
  leaves no state behind that the application is meant to keep, so a bounded workload yields a bounded footprint.
- Sampling: every 30 seconds after a forced garbage collection (`HeapProfiler.collectGarbage`), record JS heap used
  (`Runtime.getHeapUsage`), DOM counters (`Memory.getDOMCounters`: nodes, documents, JS event listeners), the renderer
  process resident set size, and the main process resident set size (`ps`).
- Phases: 2 minutes of warm-up that is not scored, then 8 minutes scored. The default run lasts 10 minutes; the
  duration, cycle rate and sampling interval are options so a short smoke run takes under a minute.

## Result

The script writes one JSON file and prints a table: every sample, the least-squares growth per minute of each metric over the
scored window, the first-to-last difference, and a verdict against budgets. Budgets are recorded in the file and start as
generous constants (for example, heap growth under 2 MiB per minute and zero net growth in event listeners and documents);
they are tuned only from measured runs and the changes are recorded in the report. A run that cannot sample (renderer crash,
stalled CDP) fails with the reason instead of reporting zeros.

## Limits

One machine and one workload shape. It does not model a real model stream, a large history, a long idle period, the
packaged app, or other platforms. A pass is not proof of no leaks; a fail names the metric and the window. Tracing and the
synthetic emitter add their own overhead, which the first cycles absorb as warm-up. The numbers from a shared or busy host
are upper bounds.

## Tests

Pure functions (slope, budgets, verdict, option parsing, cycle frame builders) are unit-tested without Electron. The full run
is a manual command and an advisory CI step added later; this specification does not add it to CI.
