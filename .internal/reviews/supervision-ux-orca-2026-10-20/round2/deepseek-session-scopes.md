## Correctness review — session / last-turn review scopes (read-only, final)

**Verification limit:** this session had no shell, and `desktop/packages/ui/node_modules/@defai-digital/ax-code-sdk` contains only `package.json` and docs (no `dist/`), so neither typecheck nor tests could run. All findings below are source-read; none is confirmed by execution.

### High

1. **False empty state while messages hydrate** — `SessionChangesView.tsx:140-141,169-172`. `useSessionMessages` returns `EMPTY_MESSAGES` until the message slice is loaded (`sync-context-impl.tsx:1768-1788`), so `messageID === null` on a freshly opened or deep-linked session makes the effect write a `ready` snapshot with no files. "Last turn" shows *"The agent has not changed files in its last turn"* instead of loading. `useSessionMessagesResolved` (`sync-context-impl.tsx:1792`) exists for exactly this and is unused.
2. **Refetch loop from the `session_diff` signal** — `SessionChangesView.tsx:144-147,196`. The effect keys on array identity, and the reducer installs a fresh array on every `session.diff` event (`event-reducer.ts:566-569`). Each event cancels the in-flight request, issues another, and forces a full FNV-1a rehash of every `after` (`:208-218`). During a busy turn the fetch never settles, and hashing cost scales with total diff size.
3. **Unverified turn-key contract** — `SessionChangesView.tsx:176-183` sends the *user* message id to `session.diff`. Nothing in the repo (`types.ts:15-22`, sync docs, tests) pins whether the endpoint wants the user message or the assistant message that owns the turn. If it is the latter, "Last turn" silently returns the wrong or empty set, and the client-mocked tests cannot detect it.

### Medium

4. **Scope state survives a session switch** — `DiffView.tsx:941-947`. `chosenScope` is never reset; when `currentSessionId` clears, the pane silently renders "All" while still holding `session`, then jumps back to session scope on the next session without any user action.
5. **Session diffs bypass virtualization** — `SessionChangesView.tsx:288` hardcodes `layout="inline"`, Pierre's non-fill fallback (`PierreDiffViewer.tsx:778-786`), nested in another `overflow:auto` box (`.session-changes__diff`). Large session diffs render every row, unlike the git scopes' fill path.
6. **Two keydown listeners on one pane** — `DiffView.tsx:1490-1493` passes an empty list "so its handler owns [, ], v", but both hooks attach to the same `paneRef`; correctness rests on child-before-parent effect order, and `v` in `DiffView` only no-ops through `findIndex === -1` (`useReviewProgressStore.ts:169-171`). Duplicate-handler regressions are invisible to the current tests.
7. **Automation contract drift** — `data-review-scope` (`DiffView.tsx:1947`) now carries five radios, and the new `data-session-changes` hook (`SessionChangesView.tsx:297`) has no e2e or WebMCP coverage; tests assert only `data-session-scope`.

### Low / checked-OK

- A published `session_diff` entry permanently disables the idle refetch (`:158-166`), so "Last turn" can lag one turn behind.
- The serial guard is correct — no stale response is written (`:174,184`) — but no `AbortSignal` is passed, so superseded requests still run to completion.
- `readSessionDiffs` throws inside `try`, so errors become the retry state and never propagate (`:91-94,186-190`).
- Read-only guarantees hold: no stage/revert path, the viewer is mounted without a directory, and the empty-side layout rule matches the ≥1100px + both-sides spec (`:120`).