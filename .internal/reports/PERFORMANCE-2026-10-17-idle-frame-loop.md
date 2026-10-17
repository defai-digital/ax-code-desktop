# Idle frame loop in ScrollShadow, and the Chromium trace of streaming

Date: 2026-10-17
Status: Fixed and tested; measured in the production bundle of an isolated dev instance

## Question

The 2026-10-15 report said 67% of streaming CPU was native rendering and left the split unexplained.
This report records a Chromium trace of the real renderer to find out, and what it turned up.

## Method

Isolated dev instance serving the production bundle, a scratch project, a fixture session seeded with
120 markdown messages (no model call, deleted afterwards), and a synthetic assistant message streamed
at about 330 characters per second for 15 s through the app's own event socket. Trace categories:
`toplevel`, `blink`, `cc`, `viz`, `gpu`, `v8`, `devtools.timeline`. The machine was under load
(load average 24 to 40 from other processes), so absolute numbers are pessimistic.

## Streaming is already cheap

| Over 15.5 s of streaming    | Result                  |
| --------------------------- | ----------------------- |
| Renderer main thread busy   | 1,168 ms (7.5% of wall) |
| Main-thread task p50 / p95  | 0.07 ms / 0.82 ms       |
| Longest main-thread task    | 11.5 ms                 |
| Layout or paint over budget | none                    |

A 500-message history cost the same as 120 (virtualization), so there is nothing to tune on the
streaming path. muse and grok were each shown these numbers and independently answered that no
low-risk change is worth making there.

## What the trace did find: a self-sustaining idle loop

The same trace with nothing streaming still showed a commit on every display frame (about 120 per
second): 4,989 `requestAnimationFrame` callbacks and 2,435 main frames in 20.5 s, of which 2,271 were
aborted because nothing changed and only 296 reached the screen. The renderer main thread spent
1,488 ms busy (7.3%), the compositor 536 ms, and the GPU process another 415 ms, with the app idle.

Sampling `requestAnimationFrame` callers pointed at `ScrollShadow`. Its `checkOverflow()` rewrote
`data-top-scroll` and friends on every call. Setting an attribute to its current value still queues a
mutation record, and `ScrollShadow` observes its own element with `attributes: true`, so each check
scheduled the next one through a `MutationObserver` and a `requestAnimationFrame`. The loop ran at the
display refresh rate for as long as any `ScrollShadow` with the default `observeMutations` was
mounted, which includes the chat container.

## Fix

`setAttributes` now writes a data attribute only when its value changed. `removeAttribute` on an
absent attribute queues no record, so the loop ends after one settling pass. Two component tests pin
this: one fails on the old code (31 frame requests against 11 once settled) and one checks that the
top, bottom and both states are still reported and updated.

## Result (same fixture, idle, production bundle)

|                               |                   before |                 after |
| ----------------------------- | -----------------------: | --------------------: |
| `requestAnimationFrame` calls |           4,989 / 20.5 s |           48 / 10.5 s |
| Main frames begun             |                    2,435 |                    65 |
| Renderer main thread busy     | 1,488 ms / 20.5 s (7.3%) | 97 ms / 10.5 s (0.9%) |
| Compositor thread busy        |                   536 ms |                 76 ms |
| Trace size                    |           685,251 events |         63,936 events |

While streaming, the main thread dropped from 1,168 ms to 1,034 ms and the longest task from 11.5 ms
to 5.9 ms. Idle work is what matters most for an app that stays open all day: it is the difference
between the app sleeping and keeping the display pipeline awake.

## Not changed

- The chat auto-follow scroll loop in `useChatAutoFollow` also requests frames, but it is a bounded
  convergence loop that stops after a settle count, so it was left alone. It was active in one of
  three runs, right after the fixture finished loading.
- Other `MutationObserver` users that observe attributes (tool output dialog, embedded browser,
  terminal viewport, toaster) only mount in those views and showed no loop in the main-view trace.
