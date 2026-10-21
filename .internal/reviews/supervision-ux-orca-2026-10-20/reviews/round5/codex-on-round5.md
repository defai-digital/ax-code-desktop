Found five defects. Reviewed the diff and all listed untracked files; no files modified. In-memory reproductions confirmed findings 1, 4 and 5.

1. **P1 — Raw error credentials become persistent feed text.** [activityFeed.ts:59](desktop/packages/ui/src/lib/supervision/activityFeed.ts:59)  
   When activity is absent, the preview copies `row.errorMessage`, which originates from an unsanitized runtime error. An authentication error containing `token=…` survives truncation and is persisted in localStorage. The existing activity credential filter never runs on this fallback. **Fix:** omit error text from persisted events, or sanitize it before truncation and persistence.

2. **P2 — Pop-out feed stays stale and can overwrite newer persisted events.** [useActivityFeedStore.ts:69](desktop/packages/ui/src/stores/useActivityFeedStore.ts:69)  
   Recording is correctly disabled in secondary realms, but this store has no storage-event/BroadcastChannel synchronization. A pop-out opened before a transition never receives that event. Clicking “Mark all read” there persists its stale `events` array alongside `seenAt`, overwriting newer events in storage; the primary window also retains its old unread state. **Fix:** synchronize snapshots and route read-receipt mutations through the primary writer, preserving the latest events.

3. **P2 — Selecting a hidden feed session selects another session instead.** [MissionControl.tsx:243](desktop/packages/ui/src/components/supervision/MissionControl.tsx:243)  
   The feed includes sessions outside the current filters, working set or expanded groups. Clicking such an event only sets its ID. The selection fallback immediately chooses the first visible row, and the feed transfers focus to the grid. Pressing Enter consequently acts on that unrelated session. **Fix:** reveal the target by adjusting mode, filters and collapsed groups before selection, or explicitly open the event’s session. Handle unavailable sessions without selecting a substitute.

4. **P2 — Directory changes during an outstanding preview request suppress the replacement request.** [remoteActivityCache.ts:84](desktop/packages/ui/src/lib/supervision/remoteActivityCache.ts:84)  
   Start a request for session S in `/old`, then move S to `/new` with unchanged `updatedAt`. `pending` is keyed only by session ID, so the old request’s revision is recorded as attempted for `/new`. After completion, `/new` is skipped indefinitely until its revision increases. **Fix:** include directory identity in pending requests and only credit matching requests to a directory’s attempt receipt.

5. **P2 — A failed preview refresh relabels old-directory text as new-directory text.** [remoteActivityCache.ts:98](desktop/packages/ui/src/lib/supervision/remoteActivityCache.ts:98)  
   After caching `/old`, move the session to `/new` and fail the new fetch. `fetch()` retains the previous preview without checking its directory, then publishes it with `directory: "/new"`. This defeats the hook’s directory guard and displays stale activity from `/old`. **Fix:** retain a previous preview only when its directory matches the requested directory; otherwise start with `null`.

