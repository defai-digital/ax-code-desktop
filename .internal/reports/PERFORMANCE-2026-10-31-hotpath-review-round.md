# Hot-path review round: surfaces added since 2026-10-23

Date: 2026-10-31
Status: items marked "shipped" are committed on `main`. Nothing here reopens the settled decisions (no Rust, no event
shedding, no DOM change for long open paragraphs, no reference-equality refetch guards on streaming state).

## Method

103 commits (about 9.4k lines under `ui/src`, `web/server` and `electron/src`, plus the vendored AkiTTY Web terminal)
landed after `c33a117b`. Two reviewers took disjoint slices read-only against `1bc70821` in detached worktrees:
muse (sync pipeline, web server, Electron main) and grok (renderer components, hooks, the vendored terminal).
Every finding had to cite `path:line` and state CONFIRMED or SUSPECTED. The author re-read the code and measured the
two sync P1s before the reports arrived (Node probes through the UI package's vitest runner, loaded macOS host):

| Probe | Result |
| ----- | ------ |
| Retention sweep, one directory at the 20 MiB cap (40 sessions x 150 messages x 3 parts of 1,000 chars) | 9.3 ms median, 11.0 ms p90 per sweep |
| Retention sweep, 10 sessions x 50 messages x 3 parts of 500 chars (1.7 MiB) | 0.7 ms median |
| Re-materializing an unchanged 200-message snapshot (0.93 MiB JSON) | 0.7 ms parse + 0.8 ms materialize |

Implementation: muse (poller and retention, its own findings) and the author (git store, replay buffer, startup
diagnostics) in separate worktrees; every fix has a regression test with a mutation probe. Cross-review by a different
CLI than the author: grok reviewed muse's sync diff (found 2 P1s, fixed by the author, see below), muse reviewed the author's three fixes (1 P2, 7 P3, all fixed or recorded), muse reviewed grok's browser fix (1 P2, 3 P3, fixed), muse reviewed the upstream AkiTTY change (0 P1, 0 P2, 3 P3, two fixed upstream), and muse verified the fix-ups (0 P1, 0 P2, 2 P3; both fixed: a synchronous bridge throw now counts as a failed poll instead of leaving the in-flight flag set, and the touched-row poller test now locks the forget-not-stamp half).

## Shipped

| Finding (reviewer) | Change | Evidence |
| ------------------ | ------ | -------- |
| P1 (muse): the external-session poller (`external-session-poller.ts`, 3 s) re-read every recently updated session's transcript on every tick with no watermark: 1 `session.list` per directory plus 1 `session.messages` per candidate (up to 200 records for the open session), about 60 requests/s at 30 directories x 5 recent sessions, for 30 minutes after each session's last update, duplicating SSE while the stream is healthy. | A per-store, per-session watermark `{ updated, applied }` of the listed `time.updated` the last completed evaluation saw and whether that evaluation applied the page; the read is skipped when `time.updated` is unchanged, the poller does not own a synthesized busy status, and (for the open session) the page was applied, so a session evaluated in the background pays exactly one catch-up read when it is opened. The watermark is forgotten, not stamped, when the runtime is active, when the ABA guard trips, or when the row was touched during the read; evaluation and `lastActivityAt` use the row as it is after the read. The open session absent from the list is still read every tick. One `Map` of sessions replaces three linear `find`s per candidate; records are sorted once. | `external-session-poller.test.ts` (+9 tests: idle/unchanged skips, owned busy keeps reading, absent open session, guard-tripped owned read is retried, background evaluation then opened, touched row evaluated and forgotten, disposed store released, one read per candidate); probes: `expected "vi.fn()" to be called once, but got 3 times` with the watermark removed, and one failing test each for the `applied` flag, the forget on a tripped guard, and the stamp of a touched row |
| P1 (muse, author): the retention sweep (`session-retention.ts`, coalesced to 1 Hz while slices change, plus every 30 s) deep-walked every message and part of every session with `retainedPayloadSize` on every sweep: 9.3 ms median per directory at the 20 MiB cap (measured), for every loaded directory. | Per-session byte sizes cached on the identity of the five state slices and of each message's parts array; only changed arrays are re-priced; evicted and trimmed sessions update or drop their entry. Eviction and trimming semantics unchanged (the 13 existing retention tests pass untouched). | new `__tests__/session-retention-size-cache.test.ts` (second sweep over unchanged state: 0 calls; one part change: 1 call; byte-cap eviction with cached sizes); probe: `expected 4 to be 1` |
| P2 (muse): the poller's `owned` map kept disposed directory stores (and their 20 MiB of content) alive for the app lifetime once it had synthesized a status for them. | Entries for stores no longer in `childStores.children` are released at the start of each tick. | poller test "releases the synthesized status of a disposed store on the next tick"; probe: `expected { type: 'busy', ... } to be undefined` |
| P2 (muse): `useGitStore` re-priced every retained directory's payload (up to 20 MiB of status, log and diff text) on every store write, including one-flag loading updates; `removeDirectoriesMatching` published once per removed directory. | Payload bytes cached in a `WeakMap` keyed by the immutable directory entry; batch removal is one `set`. Also from the review: repository summaries bounded at 512 (least recently updated first, never a working-set directory) and the evicted-request map bounded the same way. | new `useGitStore.retention-cost.test.ts` (5 tests); probe: 3 of 5 fail with the production change reverted |
| P2 (muse, found newly reachable): `startup-diagnostics.js` ran a synchronous recursive `mkdirSync` on the Electron main thread for every renderer warning (they reach `record` with `once: false` since `renderer-console-message.js` fixed event parsing) and appended to `main.log` with no size cap, within and across sessions. | One `mkdirSync` per process (re-armed after a failed append); the size is checked on the first append of a process and then every 128 appends through async `stat`; over 2 MiB the file is renamed to `main.log.1`, or truncated when the rename fails (Windows). `main.js` unchanged. | new `startup-diagnostics.test.mjs` (6 tests, injectable `fs`); probe: 4 of 5 fail with the change reverted |
| P2 (grok): the embedded agent browser polled `desktop_webmcp_browser status` every second with no hidden gate, and every poll rewrote the address history in `localStorage` (parse, sanitize, `setItem`) even when the URL had not changed. | The status interval returns before the IPC while `document.visibilityState` is hidden (not a poll failure) and the `visibilitychange` listener runs one status read when the document becomes visible; one read is in flight at a time (the catch-up and the interval never overlap), and the bridge call starts inside a promise so a synchronous throw is one failed poll rather than a permanently set flag; `rememberWebMcpAddress` returns before `localStorage.setItem` when the front history entry already holds this url for the same directory and session and no duplicate of that identity sits behind it. Catalog handling unchanged. | `EmbeddedWebMcpBrowser.test.tsx` (+3: hidden: 5 reads stay 5, visible again: 6 without waiting, unmount: no more; a pending read blocks the catch-up and the next tick; polling continues after a synchronous throw) and `useWebMcpBrowserStore.test.ts` (+3: same url twice: one `setItem`; another identity at the front still writes; a duplicate behind the front collapses once); probes: `expected length 5 but got 10`, `expected length 6 but got 5`, `expected "setItem" to be called 1 times, but got 2 times`, `Error: bridge unavailable` with the promise wrapper removed |
| P2 (grok): a hidden embedded terminal (`TerminalView` stays mounted under a `hidden` tab panel after the first visit) kept scheduling an empty `requestAnimationFrame` at display rate for the rest of the window; a hidden pane in a visible window is not throttled by Chromium. | Fixed upstream in AkiTTY (`/Users/akiralam/code/akitty` commit `1e58e33`, `packages/akitty-web/lib/terminal.ts`): the off-screen branch parks the loop and the visibility observer restarts it with a full redraw. The Desktop copy under `desktop/packages/akitty-web` is a hash-verified pin of upstream `6c6052f` (`SOURCE.json`, `scripts/verify-source.mjs`), so it is not patched here; it lands with the next AkiTTY Web pin. | upstream `hotpath.test.ts` "stops scheduling frames while off-screen"; probe: 14,572 vs 7,012 `requestAnimationFrame` calls |
| P2 (muse, SUSPECTED): terminal replay buffer eviction used `shift()` per evicted chunk. | Head index with amortized compaction (after 1,024 evicted chunks or one cap of evicted bytes). | `output-replay-buffer.test.js` (+3 tests); 150k one-byte appends: 1.7 s before, 20 ms after |


## Rejected or corrected after measurement

- muse reported the terminal replay buffer's `shift()` eviction as quadratic and said a 200k one-byte probe "did not
  finish". Measured here: 150k one-byte appends took 1.7 s with the shift and 20 ms with a head index. The head index
  shipped as a small cleanup, not as the P2 it was filed as.
- The poller watermark design in muse's report assumed every message or part write bumps the session's
  `time.updated`. The runtime bumps it only in `Session.touch` (once per prompt, after the user message) and on
  session-level updates (rename, archive, revert, permission, metadata). The shipped watermark therefore skips a read
  only for sessions whose last evaluation was idle; a session the poller marked busy is still read every tick until it
  evaluates idle.

## Open

| Item | Why it stays open |
| ---- | ----------------- |
| The Desktop copy of AkiTTY Web still schedules the empty off-screen frame (and the hidden scrollbar/smooth-scroll animations) until the vendored package is re-pinned to an upstream commit at or after `2f6937e`. | `desktop/packages/akitty-web` is a hash-verified pin (`SOURCE.json`, `scripts/verify-source.mjs` fails `type-check` on any edited file); upstream `main` has 1,749 more lines in `lib/` since the pin (`6c6052f`), so a re-pin is its own reviewed change, not a hot-path patch. |
| `SessionRetention.sizeCache` keeps a session's message and part array references for up to one sweep (1 s) after the reducer's `cleanupSessionCaches` on archive or delete (grok P3). | The next sweep drops ids missing from state; a one-second overlap of references that the store itself just released is not worth a second cleanup path. |
| The external-session poller still reads an open session with an empty page on every tick (its `shouldApply` never runs, so no `applied` watermark is written). | Same as before this round; empty sessions are rare and the page is tiny. |
| `startup-diagnostics` loses the one line whose append fails after the log directory disappears at runtime (muse P3). | Accepted for a diagnostic log; the next append recreates the directory. |
| The 30 s unconditional `sweepRetention` + `runEviction` interval in `sync-context-impl.tsx` has no visibility gate. | With the size cache a sweep over unchanged state is pointer work only; measured need first. |
| Items left open on 2026-10-23 that this round re-read and left alone: optimistic-status stamping (now documented as intentional at `sync-context-impl.tsx:643`), reconnect error swallowing, quit deadline. | No cheap safe fix identified (muse). |


## Verification

Run from the repository root on 2026-10-31 against `769659f1` plus this change, in CI order, all exit 0:

| Gate | Result |
| ---- | ------ |
| `pnpm run check:boundaries` | passed (all twelve checks, including `check:source-text-tests`) |
| `pnpm run typecheck` | passed |
| `pnpm run lint` | passed |
| `pnpm run test` | root scripts 253 passed (7 skipped), tools 383 (2 skipped), electron 1,218 (1 skipped), ui 5,393, web 1,539 (2 skipped) |
| `pnpm run build` | passed (`startup-diagnostics.js` is an Electron main-process module) |

`check:locales` was not run: no message catalog changed. Every production change was mutation-probed in the integration
worktree before the copy (production reverted or mutated, the named test fails, production restored); the probe
messages are listed per row above. The fix-ups after muse's final verification (promise-wrapped bridge call, touched-row
poller test) were probed the same way: `Error: bridge unavailable` with the wrapper removed, and `expected "vi.fn()" to
be called 3 times, but got 2 times` with the touched row stamped instead of forgotten.

## Process notes

- Reviewer accuracy this round: muse's two sync P1s and grok's two renderer P2s were all confirmed by reading and (for retention) by measurement; muse's replay-buffer P2 was overstated ("did not finish" vs 1.7 s measured) and its watermark premise (every write bumps `time.updated`) was wrong, caught by reading the runtime source before the brief went out. grok's cross-review of muse's implementation found the two P1s that the author's own read missed (a background evaluation stamping the watermark; a tripped guard keeping the old stamp). Cross-review by a different CLI than the author remains the step that pays.
- Round timing: muse read-only review 15 min, grok 50 min; muse implementation 20 min, grok implementation 15 min; grok cross-review 45 min, muse cross-reviews 10 to 15 min each.
- Upstream AkiTTY commits `1e58e33` and `2f6937e` are local to `/Users/akiralam/code/akitty` and not pushed; the Desktop pin stays at `6c6052f` until a re-pin round.

