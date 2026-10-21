I have enough evidence from reading the code. Summary of the analysis below.

## Bug Analysis

**Scope:** `useRemoteActivityPreviews.ts`, `remoteActivityCache.ts`, `remoteActivityPreview.ts` + their call site in `MissionControl.tsx:161/531`.

### Verified non-issues
- Concurrency cap (2), dedupe of in-flight sessions, revision-growth gating, failure memoisation (`attempted`), in-memory precedence, unmount `dispose()`, no stored credentials — all correct, and covered by tests.
- No React render loop: `getSnapshot` returns a stable `entries` reference, `useSyncExternalStore` is used correctly, and `pump()` runs from `update()` (effect) and `fetch()` (async), never from render.

### Defects

**1. HIGH — one (or two) wedged request(s) stop all previews, permanently**
`remoteActivityCache.ts:45`, `:62-63`
`pump()` uses `return` (not `continue`) when `pending.size >= 2`, so it abandons the *entire* remaining scan — including other consumers who have no in-flight work. Any `fetchPage` promise that never settles (the SDK's own directory-context wait is a documented 60s-stall path, `client.ts:40-47`) pins `pending` forever. With `pending.size === 2`, every later `pump()` returns at line 45 and no board row ever gets a preview again until remount. A hung session in one project starves all rows.
Fix: `continue` instead of `return`; skip a session already pending for *this* consumer so others still drain; add a deadline (`Promise.race` with a timeout) that clears `pending` for that session.

**2. MEDIUM — refetch storm for rows whose server `time.updated` advances without new text**
`remoteActivityCache.ts:39` (source: `useNeedsYouSessions.ts:66`)
`session.time.updated` is the *session record's* update time, bumped by status/heartbeat writes and by a subagent child's activity — not by new assistant text. Each bump satisfies `row.updatedAt > revision` and issues a fresh `session.messages` call, and the 2-slot queue then serialises every other row behind it. A running/retrying root with periodic writes produces continuous reads with zero visible change. There is no minimum interval between successful reads, only the revision gate.
Fix: gate refetches on `fetchedAt` too (e.g. only refetch a session that has an entry once every N seconds); make a refetch in the same text unnecessary by tolerating equal `preview` results.

**3. MEDIUM — no eviction protection for live consumers; visible rows can permanently show no preview**
`remoteActivityCache.ts:26-28`, `:35-46`
Eviction is insertion-order (FIFO) with no re-touch on access, and `pump()` skips any row with `row.updatedAt <= revision`. A board with >300 rows over the same `updatedAt` (a restart burst) evicts early rows immediately after `publish`, and their `attempted[rev]` receipt (kept forever in `Demand.attempted`) guarantees they are never re-requested. Visible rows silently render with no activity — a permanent wrong state, not a transient one.
Fix: bound `attempted` (drop entries not seen in the last `update`) and delete a session's receipt when it is evicted, or don't evict ids that an active consumer currently demands.

**4. LOW — stale directory/session pairing on cached entries**
`remoteActivityCache.ts:56-61`, `:33-34`
Keying is `sessionId` only, and `fetch` always uses the current `row.directory`. If a session's directory changes (worktree move, project re-home) at an unchanged `updatedAt`, the old preview is merged in as current, and the returned entry records the new `updatedAt` though it came from the old directory. Remote-only rows also cannot fall back to `collectActivityPreviews`'s `directoryFor` heuristic (`activityPreview.ts:122-135`) because `directory === null` short-circuits at `:34`.
Fix: store the directory in `RemoteActivityEntry` and treat a directory change as a cache miss.

**5. LOW — unmount cancels queued work but leaves budget occupied by dead demand**
`useRemoteActivityPreviews.ts:20-23`, `remoteActivityCache.ts:45`
Requests started for a consumer that unmounts are not aborted and keep both slots until they settle; the serial `return`-scan then delays a newly mounted board. Combined with (1), a closed popout can hold the budget indefinitely.
Fix: caller-owned `AbortSignal` per demand and `clearPending(demand)` in `dispose()`.

### Verdict
No blocking issue for quiet boards, but defect 1 is a real availability failure and 2/3 are design-brief violations (refetch gating, bounded-cache behavior). All five share the same fix locus — `pump()`'s scan loop and the entry's lifetime metadata — so they should be repaired together, with tests for a never-settling fetch and a >300-row equal-`updatedAt` board.