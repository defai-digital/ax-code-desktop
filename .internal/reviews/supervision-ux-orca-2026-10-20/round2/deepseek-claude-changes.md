## Bug Analysis (read-only review; max 450 words)

I reviewed the four areas by source reading and cross-checking the sync layer. No test run was possible (no shell in this session), so findings marked *unverified* are static only.

### HIGH — "This session" shows summaries instead of diffs (confirmed in source)
`SessionChangesView.tsx:155-158,181` prefers the synced `session_diff[sessionID]`. That slice is also the CDN/persisted session summary: `event-reducer.ts:566-569` stores the `session.diff` event (whose entries are summary-shaped), and `sanitize.ts:33-58` strips `before/after/from/to` from exactly that record before it enters state (`sync-context-impl.tsx:844`, `event-reducer.ts:516,530`). `normalizeFileDiffs` (`:109-110`) then supplies `""` for missing text, so the viewer sees `original === modified === ""` and renders unchanged files; `sessionDiffLayout` (`:126`) returns `null`, so the layout toggle silently disappears. The one-GET fallback at `:201` is unreachable whenever the event fired (normal case), which is the opposite of the intended precedence.

### MEDIUM — a turn with no `session.diff` stays stale after the turn ends
The idle re-read (`:168-176`) returns early when `sessionDiffEntry !== undefined` — but the entry is set before the turn starts, so on `turn` scope the GET fallback is never reachable either. Meanwhile the turn scope never re-reads messages: `useSessionMessagesResolved` is true as soon as the key exists (`sync-context-impl.tsx:1792-1803`), and loading/finishing events only merge parts, so `summary.diffs` written at turn end (`stripMessageDiffSnapshots`) is not pulled in. Result: "Last turn" shows "no changes" for a completed turn with changes until the messages are reloaded. (Static; depends on whether the runtime streams the user message with its summary.)

### MEDIUM (pre-existing, amplified) — optimistic chat messages lead to a false "no changes"
`lastTurnUserMessage` (`:75-87`) takes the *latest* user message; `optimisticSend` (`session-actions.ts:950-962`) appends one with no summary for every sent prompt, and that key exists immediately. So right after sending, "Last turn" is legitimately empty and only refreshes when the server's copy — strip- or not — replaces it; there is no busy→idle refresh in `turn` scope (see above). The code comment at `:189` ("it updates when the summary arrives") is therefore not true for this path.

### LOW — misc
- `session-actions.ts:1063-1088`: callers are fine (`MissionControl.tsx:436` sums booleans and catches throws; `useKeyboardShortcuts.ts:579` and `ChatInput-impl.tsx:2912` use `void`/`.finally`). No bug in behaviour.
- `DiffView.tsx:945-948`: render-phase setState is inside the guarded branch, so it's legal and finishes in one re-render; the reset only fires on a session-id change. No bug.
- `CommitInput.tsx:65`: Enter with a modifier but during composition returns without `preventDefault`, so a newline can be inserted in the message — cosmetic only. Double-submit is blocked by `disabled+canCommit`.

### No real bugs
#3 (CommitInput/CommitSection wiring and IME guard) and #4 (abort callers) check out.