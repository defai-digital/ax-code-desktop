# Round 8 package A review fixes

Date: 2026-10-21. Scope: PRD-2026-10-21 CS-25 / CS-26, findings 1–4 in `kimi-on-package-a.md`.

Implemented in the existing working tree. No commit, push, release, or grant persistence was performed. Only these six repository files were edited by this task:

- `desktop/packages/electron/src/desktop-webmcp-browser.js`
- `desktop/packages/electron/src/desktop-webmcp-browser.test.mjs`
- `desktop/packages/ui/src/components/layout/EmbeddedWebMcpBrowser.tsx`
- `desktop/packages/ui/src/components/layout/EmbeddedWebMcpBrowser.test.tsx`
- `desktop/packages/ui/src/hooks/useWebMcpBrowser.ts`
- `desktop/packages/ui/src/hooks/useWebMcpBrowser.test.ts`

The existing `WebMcpToolPanel` mount and `catalog` mapping remain intact. No store, locale dictionary, or `lib/i18n/store.ts` changes were needed. No user-facing strings were added, so no `i18n-additions-a8fix.json` is required. Existing strings and locale fail-closed behavior are retained.

## Finding 1: Failed session start leaves a pending enable request

Change: `useOpenProjectBrowser` consumes the pending enable request when session creation returns false or rejects, before displaying the existing session-required toast. The tab-bar Enable button uses this shared hook, including session creation, instead of directly incrementing the store request counter.

Regression coverage:

- Hook tests exercise both an empty session result and a rejected creation promise, and verify `enableConsumed === enableRequests`.
- Component tests click the actual tab-bar Enable button from a draft, assert session creation in `/repo`, then select an unrelated session and advance beyond the enable timer and polling interval. No enable IPC request is sent.
- Existing coverage retains the successful draft-to-session explicit-click path and request retirement on session switches, pane closure, and pause.

Mutation probes:

- `1-retire`: Remove the failure-path `consumeEnableRequest`. Both failed-start cases fail on the unconsumed request assertion.
- `1-tab-path`: Restore the direct store request in the tab CTA. Both cases fail because the session starter is never called.

## Finding 2: Canceled agent navigation still loads

Change: Navigation checks provider lifetime, abort state, and the canceled request set before loading. Each agent navigation has a controller linked to provider abort and runtime cancellation. Aborting stops the in-flight `webContents` load and settles its wait. The load sequence prevents cancellation of an older navigation from stopping a newer user navigation. Abort listeners and request-controller entries are removed on completion. No canceled request is replayed on resume.

Regression coverage:

- A request canceled in its dispatch batch never calls `loadURL` or sends a reply.
- Pause and runtime cancel each call `webContents.stop()` for an in-flight agent load. A simulated late completion cannot change the page; no reply or replay occurs.
- Canceling an older agent load does not stop a newer user navigation.
- Existing late-poll-after-pause coverage remains passing.

Mutation probes:

- `2-preload-cancel`: Remove the pre-load canceled-request check. The dispatch-batch test detects the unexpected `loadURL` call.
- `2-stop`: Remove `webContents.stop()`. Both pause and runtime-cancel tests fail on the missing stop.

## Finding 3: Superseded load error sticks on a healthy page

Change: Initial, user, and agent URL loads share a sequenced loader. Only the current sequence can publish a load failure or clear a load error after success. Reload and page navigation advance the sequence. Managed load errors come from their correlated promises; uncorrelated late `ERR_ABORTED` events are ignored. A successful main-frame navigation clears stale page-load errors, including while an older superseded load remains unsettled. Renderer status application accepts an explicit null error from main. Local IPC command failures remain visible until another explicit command or browser lifecycle, preserving the separate local failure behavior.

Regression coverage:

- An agent navigation supersedes an in-flight Go; the older ERR_ABORTED event and rejection leave the healthy agent page error-free.
- Same-URL loads complete out of order: an old failure cannot overwrite a healthy latest load, and an old success cannot clear the latest failure.
- A late ERR_ABORTED event after both promises settle cannot reintroduce the error.
- Main-frame success clears a stale error, including with an older promise still pending.
- A renderer poll clears the stale native error and its visible alert.
- Healthy polls retain an IPC command failure; the next successful explicit command clears it.

Mutation probes:

- `3-error-sequence`: Remove the failure sequence guard; the stale-error assertion fails.
- `3-success-sequence`: Remove the success sequence guard; the latest-failure preservation assertion fails.
- `3-late-event`: Accept uncorrelated ERR_ABORTED events; the healthy-status assertion fails.
- `3-main-frame-clear`: Remove main-frame success clearing; the recovery assertion fails.
- `3-renderer-clear`: Restore truthy-only error application; the stale error and alert remain and the test fails.

## Finding 4: Enable/resume classification uses cached capability

Change: Main returns fixed failure reasons (`runtime-incompatible`, `session-required`, or `enable-failed`) with browser status. The renderer maps the reason directly and marks compatibility false for a current incompatibility result. IPC transport failures use the generic enable-failed code and do not infer a cause from the capability cache. Native error text, URLs, and credentials do not cross this failure response.

Regression coverage:

- Main enable and resume incompatibility tests assert the fixed reason, disabled access, and absence of inappropriate enrollment.
- Missing compatibility remains generic rather than claiming incompatibility; draft enrollment returns session-required.
- Component tests exercise both Enable and Resume while cached compatibility is true, return runtime-incompatible from main, and verify the error, compatibility state, and rendered explanation.

Probe: Deterministic response injection covers a stale compatible cache in both component tests. A mutation probe was not requested for finding 4.

## Verification

| Check | Result |
| --- | --- |
| `pnpm --dir desktop/packages/ui exec vitest run src/hooks/useWebMcpBrowser.test.ts src/components/layout/EmbeddedWebMcpBrowser.test.tsx` | PASS: 2 files, 24 tests |
| `pnpm --filter @ax-code/electron exec vitest run src/desktop-webmcp-browser.test.mjs src/native-webmcp.test.mjs` | PASS: 2 files, 53 tests |
| Mutation probes for findings 1–3 | PASS: all 9 mutants killed by assertion failures; each source restored in `finally` and checked against its original hash |
| `git diff --check` | PASS |
| `pnpm --dir desktop/packages/ui run type-check` | Final run FAILS due to concurrent out-of-scope chat/permission i18n additions, detailed below |

The earlier type-check invocation passed. During this task, other work changed files outside this package. The final invocation reports missing i18n keys in `src/components/chat/PermissionCard.tsx`, `src/components/chat/message/parts/ToolPart-impl.tsx`, and `src/lib/toolHelpers.webmcp.test.ts`, including `chat.permissionCard.webmcp.how`, `element`, `submit`, `doesNotSubmit`, `textRedacted`, `text`, and `argumentsMissing`, plus `chat.toolPart.webmcp.argumentsMissing` and `failed`. No diagnostic targets this task's six edited files. These concurrent changes and the missing keys were not modified to make the global check pass.

Validation is deterministic Vitest/DOM and native-controller fixture coverage, not a packaged/native end-to-end qualification. No release claim is made.

## Evidence

All evidence is alongside this report:

- `a8fix-ui.log`, `a8fix-electron.log`, `a8fix-typecheck.log`: final validation output.
- `a8fix-probes.json` and `probe-*.log`: mutation results and individual assertion failures.
- `run-a8fix-probes.py`: reproducible, serialized mutation runner with guaranteed restoration.
- `a8fix-only.patch`: this task's delta against the initial uncommitted file contents, excluding pre-existing round-8 edits.
- `before-*`, `a8fix-baseline.json`, and `a8fix-final-hashes.json`: initial snapshots and final edited-file hashes.
- `a8fix-observed-changes.json`: changes observed since the initial snapshot; this includes concurrent work outside the six-file task scope, not edits made by this task.
