# Round 13 T13 review: pause and take over (deepseek-flash, read-only)

Shell access is still denied, so the diff could not be captured; the review below stands as the deliverable, based on the working-tree sources and tests (read-only, nothing modified). No remaining review steps require tools.

## WX-10 review — no blocking issue

**Scope caveat:** `git diff HEAD` was unavailable (shell tools rejected), so line numbers are working-tree lines from `wx10-pause`; no test was executed. All statements are from reading code and test bodies.

### Requirements check

| Claim | Result |
| --- | --- |
| Pause keeps page/storage/enrollment, no agent call runs | Holds — `pause()` keeps connection/view/partition (`desktop-webmcp-browser.js:273-280`); gates at `:434` and `:479-486`; test `desktop-webmcp-browser.test.mjs:853-884` (no DELETE, no `clearStorageData`, same generation) |
| Paused arrivals held, deadline kept | Holds — `:488-508` returns `waiting-for-resume-timeout`; tests `:886-915`, `:983-993` |
| Resume releases only this session's held call | Holds — per-view `entry.waiting?.wake()` (`:865`) plus revision/connection recheck (`:854-866`); the arm sequence in `waitUntilVisible` is synchronous, so no lost wake |
| Disconnect fails held calls with a clear reason | Holds — `agent-disconnected` sent to the held request before retirement (`:248-259`); test `:962-981` |
| Counts true, no rollback claim | Holds — count from the synchronous `activeRequests` snapshot (`:234-243`); copy at `en.ts:2649-2650`; tests `EmbeddedWebMcpBrowser.test.tsx:238-282`, `:322-336` |
| Late completions cannot become success | Holds — `:236-238`, `:540`, adapter `native-webmcp.js:426-430`; test `test.mjs:1862-1868` |
| Focus / accessible names | Holds — `EmbeddedWebMcpBrowser.tsx:103-111`, controls `:469`, `:478`; test `:284-307` |
| WX-15 visibility does not cancel running work | Holds — `:201-205`; matrix `test.mjs:1794-1871`, hidden navigation `:1390-1437` |
| Harness routes test-only | Holds — routes inside `if (scenario)` in `scripts/e2e/stub-runtime.mjs:148-178`; regression test `scenario.test.mjs:572-586` |
| Windows/macOS/Linux | Unverified — macOS arm64 only, as the handoff states |

### Medium findings

1. **Uninitialized `revision` becomes `NaN` and permanently breaks enrollment.** `pause()` does `entry.revision += 1` (`desktop-webmcp-browser.js:275`) while the view literal (`:595-618`) never sets `revision`, and `disconnect()` cannot repair `NaN` (`:245`). Later guards compare `NaN === NaN` → false, so resume returns early (`:858`) and enable throws at `:884`/`:898`. A pause on a view with no connection and not enrolling (`:276`) reaches this. Fix: `revision: 0` in the literal, plus a pause-before-enable test.
2. **Localization regression is larger than disclosed, and 13 locales now state the opposite behaviour.** `loadDictionary` rejects a catalog on key-count mismatch (`lib/i18n/store.ts:51-56`), so the seven new keys (`en.ts:2644-2650`) invalidate every non-English catalog and the whole UI falls back to English. Separately, `webmcp.detail.paused` (`en.ts:2643`) was updated only in English; every other catalog still says resume happens "without replaying pending requests" (`zh-TW.json:5119`, `de.json:5119`, `ja.json:5119`, …).
3. **W5 evidence does not meet the requirement as written.** The journey pauses/resumes an idle provider (`scripts/e2e/project-browser-webmcp.mjs:119-161`) and its steps bypass the `act()` counter (`:41-45`), so W5's budget-9 count is never recorded; only W2's `actions > 10` guard runs (`:118`). PRD W5 says "pause during a long call" and DoD item 2 wants recorded counts.

### Low findings

4. Disconnect of a held (never-dispatched) call returns `stoppedCalls: 0` (`:271`), so the UI shows no acknowledgement although the call was failed (`EmbeddedWebMcpBrowser.tsx:342`, `:509-515`; test encodes it at `test.mjs:974`).
5. A paused-but-unenrolled view (pause while `enrolling`, `:276`) makes the `resume` label fall through to a full enrollment (`:854`, `:868`).
6. The native journey asserts literal English text `'Pause agent'` (`project-browser-webmcp.mjs:137,140,142,149`), so it breaks under any non-English interface.
7. Pause/Disconnect can block up to ~2 s per in-flight call before acknowledging (`:231`, `:278`) — correct per the "wait for the reply" claim, but relevant for multi-call panes.

**Recommendation:** fix finding 1 and decide the localization scope (finding 2) before commit; record W5's long-call coverage as an explicit DoD gap if it is deferred (finding 3).
## Dispositions

- M1 uninitialized revision: fixed (`revision: 0` on every view and a guarded increment), with a pause-before-enable test;
  mutation probe killed.
- M2 localization: the seven new strings and the changed `webmcp.detail.paused` are translated in all 13 locales;
  `check:locales` passes.
- M3 W5 evidence: recorded as a gap. The native journey covers keyboard pause and resume on an idle page; pausing during a
  long call with a recorded action count remains open for the task suite.
- L4 held call on Disconnect: now counted as a stopped call, so the person is told. L5, L6, L7 recorded, not changed.
