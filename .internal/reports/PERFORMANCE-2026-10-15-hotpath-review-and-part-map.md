# Hot-path review: Rust migration question, oversized events, and the sharded part map

Date: 2026-10-15
Status: Implemented and tested; no Rust component adopted

## Question and outcome

Can the Desktop hot path be migrated to Rust for stability and speed? Measured answer: not as a
migration. The three Rust candidates that were measurable either lost or were not the bottleneck,
and the stability problems found were logic and bounding errors that a language change does not
fix. Three targeted JavaScript changes were made instead.

| Change                                                    | Commit     | Kind               |
| --------------------------------------------------------- | ---------- | ------------------ |
| Skip an oversized upstream SSE event and request a resync | `c8e52871` | stability          |
| Bound the global replay journal by size as well as count  | `3a9aaf5c` | stability / memory |
| Store message parts in a sharded `PartMap`                | `a3632292` | speed              |

## Evidence against a Rust rewrite

- Event client (existing experiment): at 20 streaming projects Rust IPC measured 71-77 ms p95
  against 38-41 ms for the current JS WebSocket path. The extra JSON parse, batch serialization and
  structured-clone boundaries cost more than the native parsing saved.
- Markdown parser (existing experiment): 3-7x faster parse for 200 K-character inputs, slower for
  small inputs (1.32 ms against 0.27 ms), with math-node and UTF-8/UTF-16 position incompatibilities.
- The renderer profile below shows JavaScript is a minority of streaming CPU; the majority is native
  rendering work that no Rust component could take over.
- Of the ~150 `fix` commits since mid-September, 84 are in `ui` and are state-machine races, stale
  snapshots and cache bookkeeping in React/Zustand code. The renderer stays JS/TS regardless.

## Stability findings

1. **Oversized event wedged the stream.** `upstream-reader.js` threw when an incomplete SSE block
   passed 1 MiB, dropped the connection and reconnected with a `Last-Event-ID` that had not advanced,
   so the runtime replayed the same event. A fake-fetch reproduction made 42 reconnects in 0.5 s and
   never delivered anything after the event. The reader now skips such an event on the same
   connection, takes its id from the block head so the cursor moves past it, and reports it through
   `onOversize`; the hub and directory bridge emit `server.resync_required`
   (`reason: "event_too_large"`). Only a block over 16 MiB still drops the connection. The ceiling now
   measures the incomplete tail, so a chunk carrying many complete events is no longer misclassified.
2. **Replay journal bounded by count only.** 2,048 entries of up to 1 MiB could retain ~2 GiB in the
   server process. It is now also bounded at 32 MiB, oldest first, never evicting the newest entry.
3. **Harness drift.** `e96419ea` made `markWebSocketUpgradeClaimed` required by
   `createMessageStreamWsRuntime`; the Electron experiment fixture did not pass it and threw an
   uncaught TypeError on every upgrade. Production wiring was complete. Fixed in the fixture.
4. Not found: the cross-project session 409 retry loop reported on 2026-10-14. No source was
   identified statically and the current runtime logs contain no 409 of that kind.

## Measurements

All on macOS arm64, Electron 44.7.0 / Chromium 152. Numbers are means or medians of the stated
runs, not production telemetry.

**Server serialization is not a cost.** `JSON.stringify` of a frame: 0.8 us (150 B delta), 26 us
(64 KiB), 101 us (1 MiB). Serializing once per client instead of per client saves at most ~0.2 ms
for a 1 MiB event with three clients, so it was not changed.

**Renderer under load, synthetic fixture** (20 projects x 2,000 cached messages, real WS bridge,
pipeline and reducer, simplified React tree). CPU profile, mean of two measured rounds:

|                                         |               before | after PartMap |
| --------------------------------------- | -------------------: | ------------: |
| `applyPartDeltaBatch` self time per run | 238 ms (36% of busy) |        1.7 ms |
| renderer busy time per run              |               666 ms |        451 ms |
| renderer memory                         |               220 MB |        198 MB |
| publication to React commit, p95        |             39-41 ms |         36 ms |

Cause: `{ ...current.part }` copied every message in the directory on each publication, ~250 us at
2,000 messages and ~1.3 ms at 8,000, per streaming project. `PartMap` keeps parts in 256 hashed
buckets; a publication copies the bucket table and the touched bucket (~0.5-0.9 us). Reads cost
one cheap hash: 500 lookups went from 3.5 to 6.8 us at 2,000 messages. The p95 gain is small and
was measured over two rounds; treat it as indicative.

**Real renderer, production bundle, typical session.** One 97-message / 334-part session opened in
an isolated Desktop instance, with a synthetic assistant message streamed into the app's own event
socket at ~330 characters per second for 15 s (markdown with headings, lists, a table and code
fences). No model call and no runtime write; the injected message exists only in the renderer.

|                                  |    dev build | production bundle (2 runs) |
| -------------------------------- | -----------: | -------------------------: |
| frame p50 / p95                  | 8.3 / 9.2 ms |           8.3 / 9.1-9.2 ms |
| frames over 33 ms, long tasks    |         0, 0 |                       0, 0 |
| main-thread task time per second |       411 ms |                 266-288 ms |
| of which script                  |       197 ms |                   88-95 ms |
| layout + style recalculation     |        24 ms |                   21-23 ms |

In the production profile 67% of busy time is native work (`(program)`: paint, composite and
rendering), React render is ~41 ms/s inclusive, and no single JavaScript function is large. The dev
build roughly doubles script time (React's development instrumentation), so dev numbers overstate.
A typical session does not drop frames while streaming; the cost is mostly native rendering of a
~5,000-node DOM that changes on every delta.

## Not established

- The production figures come from one session, one machine and a synthetic stream; the CDP profiler
  itself adds overhead.
- What the native `(program)` share consists of was not broken down (a Chromium trace would).
- Long histories with many concurrent streams are covered only by the synthetic fixture.

## Reproduction

- Fixture profile: `.internal/experiments/rust-event-stream` (`pnpm run bench:rust-event-client`
  rebuilds its bundle); the per-function CPU profile used the same fixture with
  `webContents.debugger` `Profiler.start/stop`.
- Real renderer: isolated dev instance (separate `--user-data-dir`, `AX_CODE_DESKTOP_DATA_DIR`,
  `--remote-debugging-port`), production bundle from `pnpm --filter ax-code-desktop run build`
  served by the dev server's own port, page opened at `/?session=<id>`, a `WebSocket` proxy
  installed with `Page.addScriptToEvaluateOnNewDocument` to reach the app's event socket, then
  synthetic `message.updated` / `message.part.updated` / `message.part.delta` frames dispatched on it.
