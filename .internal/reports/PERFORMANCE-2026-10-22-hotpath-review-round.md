# Hot-path review round: surfaces added since 2026-10-19

Date: 2026-10-22
Status: Items 1 to 7 implemented and committed (section "Implementation" below). Items 8 to 14 and the open-paragraph prototype remain open. Nothing here reopens the settled decisions (no Rust, no event shedding, no DOM change for open paragraphs).

## Method

273 commits (about 57k lines in `ui/` and `desktop/`) landed after the last hot-path review. Four reviewers took disjoint slices read-only
against `a51ea00e`: codex (sync, stores, subscription fan-out), grok (transcript, supervision UI, review views), ax-code deepseek-flash
(server, Electron main, transport) and ax-code glm-5.3 (bundle, startup, periodic work, long-session memory). muse was unavailable (429).
Every finding had to cite `path:line`. The author re-read the code for the items marked "re-read" and ran one microbenchmark.

## Converged findings (two reviewers, independently)

| # | Finding | Evidence | Fix size |
| - | ------- | -------- | -------- |
| 1 | Supervision activity previews run on every directory publication: `activitySliceDeps` walks every loaded assistant message of every directory before the memo can hit (`hooks/useSupervisionRows.ts:175`, `lib/supervision/activityPreview.ts:161`), then `previewLine` runs eight credential regexes over the whole last assistant text. Always on (mounted in `AppEffects`). codex + grok; re-read. | codex probe: dependency walk 0.14 ms at 10x10x150, 12.0 ms median / 17.6 ms p95 at 30 projects x 10 sessions x 4,000 messages, per publication | ~20 lines: one non-resetting 100 ms coalescing timer on the notify path; later a per-directory cache keyed on part-change hints |
| 2 | Embedded WebMCP browser pane: `MutationObserver` on `document.body` (subtree, childList, style) plus capture-phase scroll listener schedules `getBoundingClientRect`, `checkVisibility`, a dialog `querySelector` and a `JSON.stringify` every frame while streaming; the unchanged-bounds check runs after the work (`components/layout/EmbeddedWebMcpBrowser.tsx:287-360`). glm + grok. | static; up to display-refresh rate | ~15-20 lines: drop the body observer, keep ResizeObserver + resize, poll dialog presence at ~150 ms |

## Single-reviewer findings

| # | Finding | Source | Status |
| - | ------- | ------ | ------ |
| 3 | `useWebMcpPoolProjection` polls `desktop_webmcp_browser list` every second with no `document.hidden` gate, re-normalises and deep-compares (`JSON.stringify`) every view's full tool catalog, and gives `capacity` a fresh object each tick (`hooks/useWebMcpPoolProjection.ts:43-131`, `stores/useWebMcpBrowserStore.ts:197-207`). Re-read. | glm | CONFIRMED, magnitude depends on live views and catalog size |
| 4 | `useActivityRowGlide` is a `useLayoutEffect` with no dependency list and reads two rects per commit, so collapsed-activity mode forces layout per streamed delta (`components/chat/components/useActivityRowGlide.ts:31-46`). Re-read. | grok | CONFIRMED; 5-line fix (`[hiddenRows, active]`); default mode is `summary`, collapsed users only |
| 5 | `turnModelCache` is module-level and holds up to 30 `displayMessages` arrays past child-store eviction, and a rebuilt store can never hit the entry (`useChatTimelineController.ts:72-86`, eviction `sync/child-store.ts:146-158`). Re-read. | glm | CONFIRMED mechanism; size unmeasured; fix `forgetTurnModel` on dispose or WeakRef |
| 6 | Hard-deleted sessions keep attachment stashes (`attachmentsByDraft`), including data-URL payloads (`sync/input-store.ts:161-175`, `lib/sessionRemovalCleanup.ts:25`). codex probe retained 50M code units after clearing the active draft. | codex | CONFIRMED |
| 7 | Directory disposal leaves session/message routing-index entries (`sync/event-routing.ts:239`, `sync-context-impl.tsx:1533`). codex probe: 50/1,000 entries retained. | codex | CONFIRMED |
| 8 | Unscoped `useSession` in every sidebar `SessionNodeItem` searches every directory on each publication (`SessionNodeItem.tsx:354`, `sync-context-impl.tsx:1876`). 300 rows x 30 dirs: 9,000 reads, 0.72 ms median per publication. | codex | CONFIRMED, low absolute cost |
| 9 | `ReviewLandingBrowserEvidence` re-collects, `JSON.parse`s and redacts completed WebMCP outputs on every directory update while Review is open (`ReviewLandingBrowserEvidence.tsx:49-59`, `lib/webMcpCalls.ts:55-123`). | grok | CONFIRMED |
| 10 | `saveToolDraft` stringifies every stored draft on each edit (`useWebMcpBrowserStore.ts:199`). 0.10 / 2.68 / 11.72 ms median at 64 KiB / 2 MiB / 8 MiB of drafts. | codex | CONFIRMED, only with very large drafts |
| 11 | `collectRailTurns` walks every message per part update (`lib/timelineRail/timelineRailModel.ts:61-88`). | grok | CONFIRMED, small |
| 12 | Tray snapshot is rebuilt and sent over IPC every 5 s even when unchanged (`hooks/useTraySync.ts:27,128-170`). | glm | CONFIRMED, low |
| 13 | A `session.status` is turned into synthetic `openchamber:session-status` + `session-activity` frames by two producers, one deduped (`lib/event-stream/session-runtime.js:166`), one not (`server/index.js:711-766`). Low frequency, not per token. | deepseek | CONFIRMED wiring; fix needs the `session-runtime` owner to say whether repeated frames are load-bearing |
| 14 | `app://` assets have no `Cache-Control`/`ETag`, whole-file buffered (`desktop-renderer-protocol.js:428-439`). | deepseek | CONFIRMED headers; effect unmeasured |

## Rejected after measurement

- SSE reader copies and runs a CRLF regex over the whole buffer per chunk (`lib/event-stream/upstream-reader.js:265`, deepseek's top item).
  Microbenchmark on this host, one 1 MiB event: 18.7 ms (4 KiB chunks), 3.7 ms (16 KiB), 1.0 ms (64 KiB) against 11.4 / 2.6 / 0.6 ms for a
  chunk-local replace. At most a 7 ms difference for a rare maximal event. Not worth a change.
- Per-socket `JSON.stringify` in `protocol.js:102` and a replay ring buffer: already measured in the 2026-10-15 report (0.8-101 us per frame).

## Open-paragraph candidates (codex design review)

- Stable sub-block ids: defer. IDs alone do not reduce structured clone; the unchanged prefix must be omitted from the worker response, which
  needs an acknowledged-prefix protocol with full fallback on delimiter closure, revision/owner mismatch and reference-definition change.
- Throttled re-parse: worth one bounded prototype. For a live open tail above about 32 KiB, enqueue at most every 100 ms with a timer that
  deltas cannot restart; finalization, rewrites and owner change bypass it. Compare against baseline with `desktop/scripts/renderer-trace.mjs`
  (8k/32k tails, continuous streaming, finalization, several mounted owners).

## Recommended order

1. Items 1, 2, 3, 4 (always-on or per-delta work on code that did not exist at the last review; 5 to 25 lines each). Measure with
   `renderer-trace.mjs --kind paragraph --tail 32000 --rate 20` with several directories loaded, before and after.
2. Items 5, 6, 7 (long-session memory; confirm with a heap snapshot after 10+ sessions and `DIR_IDLE_TTL_MS`).
3. Items 9, 8, 11 as one cleanup; item 13 after asking the `session-runtime` owner; the throttled re-parse prototype.

## Limits

No Chromium trace or heap snapshot was run in this round, so every renderer millisecond figure is a reviewer's synthetic Node probe or static
reasoning. The reviewers' sandboxes were read-only, so deepseek and glm could not run anything. grok and deepseek reported unread files
(`axcode-runtime-supervisor.js`, `browser-eviction.js`, `terminal/runtime.js`). One host, macOS arm64, shared and loaded during the probes.

## Implementation (same day)

| Commits | Items | Notes |
| ------- | ----- | ----- |
| `58111205` | 4 glide effect, 5 turn model cache | The glide hook now takes `rowsKey` (mounted row count) and measures only when it, `hiddenRows` or `active` changes. The cache lives in `turnModelCache.ts` and holds the message array through a `WeakRef`. |
| `262feda0` | 1 activity previews, 6 attachment stashes, 7 routing index | codex wrote all three. Its attachment fix rewrote the read-generation machinery and the send path; it was replaced by a minimal `clearSessionDrafts` (the existing "stash absent, drop the read" rule already covers a late read). A test double in `useSupervisionVerification.test.tsx` lacked `subscribeRegistry` and was fixed. |
| `ff5b1012` | 2 embedded pane, 3 pool projection | grok wrote it; codex review found four real defects, all fixed: (a) a position-only move (sidebar drag) never reached a ResizeObserver, so the dialog-only throttle left stale native bounds. The mutation observer now requests a full re-measure at most once per 150 ms instead. (b) the catalog fingerprint ignored the pane's own catalog writes; it now only counts while the store still holds the exact catalog, limit and rejection the poll wrote. (c) fingerprints of closed views were never released; they are pruned each poll and cleared on cleanup. (d) the normalization test could not detect extra normalization; it now counts `readWebMcpCatalog` calls. |

Every fix has a test that fails when the fix is reverted (mutation probes run for each package, re-run by the author of this report for the glide hook, turn cache, attachment drafts and both ff5b1012 fixes).
Verification: full UI suite 658 files / 4,952 tests passed, `pnpm run typecheck`, `pnpm run check:boundaries` and `check:source-text-tests` passed, eslint clean on every changed file.

Not done: no before/after Chromium trace or heap snapshot was taken, so the gains are mechanism-level (fewer layout reads, fewer walks, fewer retained references), not measured milliseconds. Item 6 leaves an empty stash key for a deleted active session until the composer switches away (a few bytes; the payload is released). Item 7 does not move message ownership between sessions (deepseek's SUSPECTED re-parent case), which only costs a routing fallback.
