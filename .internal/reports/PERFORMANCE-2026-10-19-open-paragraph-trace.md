# Open-paragraph Chromium trace: what the renderer cost actually is

Date: 2026-10-19. Baseline: `fc0adaaf`. Status: measurement only; no application code changed.

## Question

The 2026-10-15 report attributed 67% of busy renderer time to native `(program)` work, and the 2026-10-18 report left a long
open paragraph with a 33.3 ms p95 frame gap and no long tasks. Before changing the DOM, break the cost into stages
(script, style/layout, paint, composite, raster/GPU) and decide from numbers whether a DOM change is justified.

## Method

`desktop/scripts/renderer-trace.mjs` attaches over CDP to a running instance, opens an existing session read-only, injects a
synthetic assistant message into the renderer's own event socket (no runtime write, no model call, the message exists only in
the renderer store) and records a Chromium trace while the message streams. It reports frame gaps (`requestAnimationFrame`),
long tasks, and self time per thread and event name, computed with a nesting stack so parents do not double count.

- Electron 44.9.0 production bundle (`pnpm --dir desktop/packages/web run build`), isolated `--user-data-dir`, macOS arm64,
  120 Hz display, so the frame floor is 8.3 ms.
- Session: an existing 40-message / 118-part session. The injected message joins its turn (it needs a real `parentID`; an
  unknown parent is silently dropped from the display).
- Stream: 20 deltas per second for 8 s after a 2 s warmup, 80 characters per delta (1,600 characters per second, about
  five times the rate used on 2026-10-15). Categories: `devtools.timeline`, `disabled-by-default-devtools.timeline`,
  `...timeline.frame`, `cc`, `gpu`, `blink`, `viz`, `toplevel`.
- Cases, three runs each, medians: `blocks` control (many short paragraphs, 8,000-character start), one open `paragraph` at
  8,000 and 32,000 characters, plain and with `**word**` every 40 characters, an idle baseline, and a stress case (32,000
  characters, bold, 400 characters per delta, about 8,000 characters per second).
- Raw numeric results: [trace-results.json](hotpath-2026-10-19/trace-results.json).

## Results

Frame times are milliseconds. Stage columns are main-thread self time over the roughly 8.5 s window.
Script is `FunctionCall` + worker-result deserialization + event dispatch; text/layout is shaping + layout + style;
paint is paint-artifact update + paint + pre-paint + commit + scroll layers.

| Case                   | DOM nodes | p95 | p99 |  max | Main busy | Script | Text/layout | Paint | Deserialize | Compositor | GPU |
| ---------------------- | --------: | --: | --: | ---: | --------: | -----: | ----------: | ----: | ----------: | ---------: | --: |
| idle                   |     2,157 | 9.2 | 9.4 |  9.4 |       343 |     66 |           0 |    36 |           0 |        138 | 122 |
| blocks 8k              |     2,415 | 9.2 | 9.4 |  9.4 |     2,116 |    573 |         149 |   843 |           0 |        607 | 570 |
| paragraph 8k           |     2,161 | 9.2 | 9.3 |  9.5 |     2,101 |    782 |         248 |   578 |           0 |        537 | 560 |
| paragraph 8k, bold     |     2,472 | 9.2 | 9.4 |  9.4 |     2,537 |  1,061 |         341 |   640 |          33 |        572 | 573 |
| paragraph 32k          |     2,161 | 9.3 | 9.4 |  9.4 |     1,924 |    509 |         453 |   468 |           0 |        532 | 550 |
| paragraph 32k, bold    |     2,926 | 9.2 | 9.4 |   17 |     3,036 |  1,227 |         747 |   539 |         222 |        565 | 559 |
| stress 32k, bold, 8k/s |     3,878 | 9.4 |  17 | 17.6 |     4,572 |  1,884 |       1,244 |   764 |         372 |        581 | 598 |

## Findings

1. **No frame problem in this fixture.** Every case holds p95 at the 120 Hz floor, with no frame over 20 ms and no long task. The
   worst case (about 24 times the 2026-10-15 text rate into a 32,000-character formatted paragraph) shows one 17.6 ms frame.
   The 33.3 ms p95 gap from 2026-10-18 is **not reproduced**; that harness used an offscreen renderer and a 4,000-message
   history, so the difference is not explained here.
2. **The main thread is busier than the frames suggest.** Over the idle baseline (343 ms) a typical stream adds 1.6 to 2.7 s per
   8.5 s, and the stress case reaches 54% busy. Headroom, not jank, is the thing being consumed.
3. **The load-dependent cost is script, then text shaping and layout, then paint-tree update.** Script is the largest main-thread
   stage in every paragraph case (26 to 42% of main busy). Text shaping and layout grow with paragraph length and the number of inline
   formatted nodes (from 12% of busy at 8k plain to 25 to 27% for 32k bold). Compositor and GPU time are nearly flat across
   all cases (about 0.55 s each) and sit only 0.4 to 0.5 s above idle, so no React or DOM change can recover much there.
   The earlier "67% native" figure came from a CPU profile of the main thread, not from this thread breakdown; the two are not
   directly comparable.
4. **Worker-result deserialization scales with the open paragraph.** It grows from 33 ms (8k bold) to 222 ms (32k bold) to
   372 ms (stress). One open paragraph is one Markdown block, so the 2026-10-18 changed-suffix protocol still returns the whole
   block's AST for every update. This is an inference from the trace event name and the case scaling; it was not isolated
   with a worker-side probe.
5. **The multi-block control pays more for paint-tree updates** (843 ms versus 468 to 640 ms) because it has more layers and
   scroll containers, and far less for text layout. A large open paragraph is a different bottleneck from a long message list.

## Decision

The rule written before measuring was: change the DOM only if the p95 frame gap exceeds 16.7 ms or any gap exceeds 50 ms, and one
stage accounts for at least half of the excess. Neither condition holds, so **no DOM change is justified** (no
`content-visibility`, no `contain`, no text-node append path). The dominant stage is script, which the rule routes to the
worker/suffix path, not to the DOM.

Candidates for a later, separate change (untested here; each needs its own before/after trace):

- Give a long open paragraph stable sub-block identities (for example at sentence or line boundaries) so the suffix protocol
  can return only the changed tail, which attacks the deserialization growth.
- Throttle re-parsing of an open block above a size threshold, coalescing deltas to about 100 ms.

## Limits

One machine, one 120 Hz display, one 40-message session, synthetic plain text with no headings, tables or code fences in the
paragraph cases. The host was shared with unrelated builds and tests while the runs executed, and tracing itself adds overhead,
so absolute milliseconds are upper bounds. The synthetic emitter's own `JSON.stringify` and dispatch count toward script
time (the idle row shows 66 ms of baseline script). The result says nothing about Windows, Linux, 60 Hz displays or very large
histories.

## Reproduction

Start an isolated instance with a remote debugging port (see the isolated-launch notes in the development docs), serve the
production bundle, then run, for example:

```
node desktop/scripts/renderer-trace.mjs --cdp 9339 --origin http://127.0.0.1:<server-port> \
  --session <session-id> --directory <project-dir> --parent <existing-user-message-id> \
  --kind paragraph --tail 32000 --strong 40 --rate 20 --delta 80 --seconds 8 --out result.json
```

`--kind blocks` streams short paragraphs; `--no-trace` records only the frame and long-task samples.
