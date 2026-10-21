**Verdict: no blocking issue.** No request can reach the wrong view, session or project, and I found no listener/timer/view leak on the paths I traced. Files were not modified; the review was read-only.

**Verification completed this pass:** the focused Electron pool test plus the keyed-store, pane, projection, Mission Control and review-recap UI tests pass (`envelope c93f9c2739f32b7f`). The diff-level line-attribution pass is still not possible: shell is denied outside `verify_project`, and reading the captured diff from `/tmp` was rejected. Findings below are anchored to post-change file contents, which is what I reviewed.

## Findings

**Medium**
1. `clearProject` has no sender check — `desktop-webmcp-browser.js:665-683`. It closes every view for that `projectKey` across windows (`:673`) and wipes the partition, while `revokeSession` does `lookup(sender, target.id)` (`:695-697`). A second window can destroy another window's pooled views and project storage. Same-app/local-frame only, so not an external escalation, but inconsistent with the rest of the ownership model.
2. Transient dialog or minimize cancels an in-flight agent call — `EmbeddedWebMcpBrowser.tsx:218-228` sends zero bounds for any `role=dialog`/`aria-modal`/`dialog[open]`; `desktop-webmcp-browser.js:880-882` then hides, and `hide()` cancels active requests (`:156-162`). Opening settings or the command palette mid-tool-call aborts it instead of waiting.

**Low**
3. Renderer/native key divergence — `lib/webMcpViewKey.ts:4-14` vs `desktop-webmcp-browser.js:76-80`; the pane normalizes at `EmbeddedWebMcpBrowser.tsx:610` while `useCurrentWebMcpViewKey` reads raw `currentDirectory` (`hooks/useWebMcpBrowser.ts:19-24`). A trailing slash or `..` can create a second renderer entry and make the pane read `emptyWebMcpView` (idle).
4. Pooled enrollment outlives the pane — `EmbeddedWebMcpBrowser.tsx:157-198` hides + `releaseView` on unmount; only `disconnect`/`pause`/`revokeSession`/window close revoke. Matches the handoff, but it reverses prior "closing the pane revokes access" behaviour and is only stated in English copy.
5. Storage copy overstates persistence — `partitionFor` uses a non-`persist:` partition (`:96-97`), so storage is in-memory only; `en.ts:2773` implies it survives normal use.
6. Profile registry unbounded — `guestSessions` (`:82`, `:480-485`) never shrinks; memory scales with visited projects, not `maxLiveViews`. Conflicts with the W7 "bounded memory" line and should be recorded there.
7. Poll churn — `useWebMcpPoolProjection.ts:55-72` rewrites a new object per view every second; `useActivityFeedRecorder.ts:34` subscribes to all `views`, so both re-render at 1 Hz.
8. `revokeSession` is not on `serializePool` (`:684-702`) while `create`/`clearProject` are; a concurrent `clearProject` can interleave. `disconnect` nulls `connection` first, so the damage is bounded.

**Handoff vs code:** the pool keying, `maxLiveViews` + `pool-full`, per-project partitions, serialized create/clear, additive `list`/`show`, extended status, per-session revoke, `GET /session/{id}` enrollment validation, `projectID` dispatch check, keyed store with pure `viewKeyFor` helper, store→lib-only imports and listener/timer symmetry all match. I could not independently confirm the probe table, the 200-switch leak numbers, `closeAll`-during-first-load, or the generated renderer argument types.