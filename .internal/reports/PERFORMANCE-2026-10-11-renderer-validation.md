# Electron renderer validation

## Result

Ordinary 200-message streaming was responsive in this controlled local test.
The current renderer is not consistently fast for long histories or long
incomplete Markdown paragraphs. The earlier session-projection microbenchmark
improvements are useful, but they do not establish whole-GUI responsiveness.

A production-config fixture using the actual MessageList and ChatInput reproduced
the stalls. A separate experimental build confirmed that stale virtual-row
memoization is a major cause of the long-history case. Fixing that in the build
made the 4,000-message Markdown scenario behave like the short-history scenario.
The long-paragraph and large expanded-output cases still need additional work.
No experimental production-source change was applied or committed in this task.

## Method and scope

- UI source baseline: `f7ef106080626eb658921a043dbe58219cdce91a`.
- Host: macOS 27.0, Mac15,9, 16 logical CPUs, 128 GiB RAM.
- Pinned Electron 42.5.2; Chromium 148.0.7778.271; a 1440 x 1000 window.
- Actual MessageList, ChatInput, child-store subscriptions, Markdown/tool
  renderers, themes, and CSS; ordinary production Vite configuration, minification,
  lazy chunks, and React compiler.
- A dedicated BrowserWindow and temporary userData profile; synthetic data, inert
  API providers, and a fetch stub. No coding runtime or model request was started.
  Provider selectors show loading placeholders. This is a renderer-component
  test, not a complete portfolio/server/preload/startup or real-network test.
- Four-second settling interval, followed by 12 seconds of native Electron
  keyboard input (79 key sequences) and a 300 ms drain interval per scenario.
  Streaming requests updates every 50 ms. A delayed renderer timer does not
  reproduce the backlog of an independently running SSE server.
- Structured Markdown adds headings, lists, and a code block each update. The
  paragraph starts at 90,000 characters and keeps growing without paragraph
  breaks. Tool cases publish one completed 204,000-character bash output 500 ms
  into the measured interval, both collapsed and expanded. The current tool UI
  renders output only after completion; a running-only payload is insufficient.
- Chrome Event Timing, Long Task observers, RAF gaps, CPU profiles, and renderer
  timeline traces were collected. Screenshots verify the streaming tail and
  expanded output are displayed. Traces are instrumented runs on a shared machine
  with other background work, not a statistically controlled hardware benchmark.

The keyboard p95 below uses captured trusted `keydown` Event Timing duration,
which includes queueing and presentation delay and is rounded by Chrome. The
observer captures events of at least 16 ms. The paragraph baseline recorded 78
Event Timing entries for 79 received keys; all other rows recorded 79. The
separate handler-to-later-RAF metric in raw results excludes pre-handler queueing
and must not be described as end-to-end latency. RAF gaps indicate scheduling
stalls, not exact compositor dropped frames. Initial mounting/lazy-load cost is
outside the intended warm-streaming interval; the settling period is not an
independent proof that every background initialization has completed.

Earlier harness trials using the incorrect `text` phase and running or
metadata-only tool outputs were discarded. All results below use `streaming`
and the completed-output cases were replayed separately with visible output.

## Current renderer results

| Scenario | Keyboard p95 ms | Keyboard max ms | RAF p95 ms | Tasks over 50 ms | Longest task ms | DOM nodes |
| --- | ---: | ---: | ---: | ---: | ---: | ---: |
| Idle, 200 messages | 32 | 40 | 9.2 | 0 | 0 | 6,823 |
| Markdown stream, 200 messages | 32 | 32 | 9.1 | 0 | 0 | 10,763 |
| Markdown stream, 4,000 messages | 112 | 120 | 83.3 | 43 | 77 | 129,151 |
| Growing paragraph, 4,000 messages | 432 | 480 | 441.8 | 75 | 392 | 129,788 |
| Completed tool, collapsed, 4,000 messages | 336 | 792 | 24.6 | 3 | 491 | 126,541 |
| Completed tool, expanded, 4,000 messages | 80 | 216 | 42.3 | 36 | 101 | 150,557 |

The paragraph baseline spent 8,771 ms in observed long tasks. Structured Markdown
processed 165 updates rather than the approximately 246 timer ticks seen in the
short scenario, and the paragraph processed only 52. These are further signs of
renderer saturation. Collapsed and expanded tools ran in a separate profile and
in order; do not interpret their differing numbers as a causal comparison of
expansion alone. Both receive the same output once, and only the expanded case
actually renders it.

All 12 final baseline/candidate cases received and inserted all 79 characters,
had zero captured runtime errors, and had zero additional renders of the isolated
user-history subscription probe during streaming/input. That probe establishes
history-selector isolation; it does not count all renders of ChatInput itself.
Expanded tool results assert that output is visible and has exactly 204,000
characters in the fixture store. Screenshots independently confirm its display.

## Confirmed and remaining hot paths

### Stale virtualization projection

`MessageList-impl.tsx:1502` memoizes `getVirtualItems()` using only the virtualizer
instance and the enabled boolean. The installed React virtualizer retains the
instance with `useState` while its visible range changes. The memo therefore does
not refresh with that range. When the captured rows remain empty,
`StaticHistoryList` falls back to mapping every history entry into the DOM.

The experiment removes this memo and marks this one MessageList function with
`use no memo` so the React compiler does not reintroduce equivalent caching of a
mutable virtualizer result. It is applied only in a Vite load hook, leaving
production source untouched. This is a combined invalidation/compiler experiment;
it does not isolate the contribution of each change independently.

| Scenario | Keyboard p95: current / experiment ms | Long tasks: current / experiment | DOM: current / experiment |
| --- | ---: | ---: | ---: |
| Markdown, 200 messages | 32 / 32 | 0 / 0 | 10,763 / 4,968 |
| Markdown, 4,000 messages | 112 / 32 | 43 / 0 | 129,151 / 4,952 |
| Growing paragraph, 4,000 messages | 432 / 360 | 75 / 84 | 129,788 / 4,458 |
| Completed tool, collapsed | 336 / 40 | 3 / 0 | 126,541 / 1,109 |
| Completed tool, expanded | 80 / 32 | 36 / 6 | 150,557 / 25,062 |

In the structured long-history case, experimental RAF p95 is 9.1 ms and there
are no RAF gaps over 50 ms, compared with 106 such gaps in the current renderer.
This is strong evidence for prioritizing virtualization invalidation. Initial
empty-range fallback still needs a bounded rendering strategy: the candidate's
warm measurements do not certify long-session opening performance.

### Long incomplete Markdown

The paragraph still has a 360 ms keyboard p95 and a 391 ms longest task after
historical DOM nodes are bounded. CPU profiles contain prominent Markdown-parser
work in the vendor Markdown chunk, including character/token resolution and array
splicing. `markdownStreamBlocks.ts` caches stable blocks but re-lexes/heals the
unstable tail; a single very long paragraph offers no useful stable prefix.
AssistantTextPart's streaming text throttle reduces invocation frequency but does
not bound the synchronous cost of each parse/render. The next improvement should
keep expensive unstable-tail parsing out of the input's synchronous path and
preserve final complete Markdown semantics.

### Large completed tool output

The experimental expanded-output case still contains six long tasks, with a
108 ms maximum and approximately 25,000 DOM nodes. Completed output passes its
entire text through highlighting/rendering; a running-text throttle does not bound
this final render. Bound or virtualize output rows and avoid full-output syntax
highlighting on the input-critical path while retaining access to the full result.

Timeline category totals in the JSON summaries overlap (for example RunTask,
FunctionCall, EventDispatch, Layout, and Paint); they are not disjoint CPU shares.
The traces extend slightly beyond fixture observation to include final capture.

## Evidence and reproduction

The companion directory `renderer-performance-2026-10-11/` contains:

- `baseline-results.json` and `candidate-results.json`: complete final metrics.
- `baseline-summary.json` and `candidate-summary.json`: comparable summaries.
- `baseline-hotpaths.json` and `candidate-hotpaths.json`: CPU/timeline summaries.
- Baseline screenshots for long Markdown, paragraph, and visible tool output.
- `experimental-virtualizer.patch`: the unapplied experimental source change.
- `harness/`: fixture, build/runner/analyzer scripts, and reproduction instructions.

Full local traces and CPU profiles remain in these temporary evidence directories:

- `/tmp/ax-coder-renderer-live-evidence` (first four accepted baseline cases).
- `/tmp/ax-coder-renderer-live-completed-tools` (accepted baseline tool cases).
- `/tmp/ax-coder-renderer-live-candidate-evidence` (first four accepted candidate cases).
- `/tmp/ax-coder-renderer-live-candidate-completed-tools` (accepted candidate tool cases).

Production builds succeeded for the baseline and experimental fixtures. Assertions
verified the 12 final scenarios' key delivery, captured-error absence, history
probe isolation, and completed tool output. Experimental windows and servers have
closed. Only the profiling report/evidence/harness are added to the workspace;
unrelated in-progress runtime changes are preserved.

Relevant baseline source SHA-256 fingerprints:

```text
f44123cf46ddad4f14e46b579ef6bd748409015fcd79e6ed54aa0eb9f4aa210d  MessageList-impl.tsx
4f6be63ad7ce56934e39049bf5fa3ef1ea471d76d0ff881935521823a1b5d963  markdownStreamBlocks.ts
a8ac022309b7cfc1e02044633a822e6c451bc1076f7c52502748065c84911714  session-message-records.ts
```
