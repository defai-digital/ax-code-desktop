**Review scope.** Four confirmed source-logic findings are below. Their regressions are proposed deterministic tests only; per the tool-free constraint, I did not run the suite, use mocks, or exercise the application in this session. No uncertain fifth finding is included.

## 1. High — Browser close confirmation is not bound to the navigated document

The confirmation identity in [desktop-webmcp-browser.js](/private/tmp/ax-desktop-webmcp-cli-20261112/desktop/packages/electron/src/desktop-webmcp-browser.js:376) (lines 376–387) is built from the entry ID and `contents.id`. A `WebContents` ID remains stable across main-frame navigations, while the adapter’s `generation` changes for each new document. The stored approval is therefore accepted before the current page’s unsaved-work and discard checks are re-evaluated.

A concrete sequence is:

1. Open a page that requires close confirmation and start the `close` action, obtaining `closeConfirmation`.
2. Before submitting that confirmation, navigate the same pane to another page and enter unsaved work protected by `beforeunload`.
3. Submit the old confirmation for the same entry.
4. `authorizeClose` returns `approved: true` based on the unchanged entry/`contents` identity, even though the document and its risk state changed.
5. The confirmed path in [desktop-webmcp-browser.js](/private/tmp/ax-desktop-webmcp-cli-20261112/desktop/packages/electron/src/desktop-webmcp-browser.js:446) (lines 446–462) skips the veto probe and calls `contents.close({ waitForBeforeUnload: false })`.

**Expected:** navigation invalidates the earlier approval and produces a fresh confirmation for the new document.
**Actual:** the old approval authorizes destruction of the new document without its current unsaved-work evaluation or `beforeunload` wait.

**Minimal fix:** include a document identity that changes on main-frame navigation—at minimum `entry.adapter.generation`, preferably together with the current URL—in the stored approval identity for the main document and each popup. A generation mismatch must fall through to the normal risky-document calculation rather than returning `approved: true`.

**Deterministic regression test:** Mock one entry whose `contents.id` stays constant while its adapter generation and URL change. Obtain a close-confirmation token for generation A, advance the mock adapter to generation B and mark the page as having unsaved work, then submit the token. The second call must return `confirmationRequired` and must not invoke close; the current code returns approval and proceeds.

## 2. High — A vetoed cleanup after failed browser creation leaves an unrecoverable zombie view

In [desktop-webmcp-browser.js](/private/tmp/ax-desktop-webmcp-cli-20261112/desktop/packages/electron/src/desktop-webmcp-browser.js:949) (lines 949–956), an existing map entry is immediately returned as the result of `create`, without checking whether it became `ready`. During creation, a failed initial load or adapter start enters the catch block at lines 1156–1167, which awaits `close(entry)`. If the page vetoes closure through `beforeunload`, `closeEntry` at lines 444–452 throws before marking the entry closed, deleting it from `views`, or closing its adapter.

A concrete sequence is:

1. Create a pane for a session and load a page that installs a `beforeunload` handler.
2. Make native adapter startup fail or time out.
3. The initialization catch calls the unconfirmed close path.
4. The page emits `will-prevent-unload`, so cleanup throws `Browser page refused closure`.
5. The half-initialized entry remains in `views` with `ready === false`; a later `create` for the same key returns `status(existing)` instead of retrying initialization.

**Expected:** initialization failure either removes the entry from live-pool ownership or leaves it in an explicit, retryable/closable failure state.
**Actual:** the failed entry consumes the pool key indefinitely, is hidden from the ready-only list, and later create calls return its non-ready status without restarting the adapter.

**Minimal fix:** do not let the never-ready initialization cleanup remain registered after cleanup fails. For a never-ready entry, remove it from `views`/`shown`, unbind its owner, close the adapter, and detach its child view before rethrowing; use forced guest disposal for that failed-initialization path if graceful closure is vetoed. Alternatively, record an explicit failed state and make the existing-entry branch either retry startup or report a retryable initialization error rather than returning normal status.

**Deterministic regression test:** Use a fake view whose page vetoes the first unconfirmed close and a fake adapter whose first `start()` rejects but whose replacement can succeed. The first `create` must reject, and a second `create` for the same key must construct/start a fresh usable entry or return a defined retryable error; it must not merely return the first entry’s non-ready status. `poolStats().liveViews` should reflect only the replacement entry.

## 3. Medium — Definitive invoke rejection never acknowledges cancellation, and a still-finishing invoke can stay pending forever

In [native-webmcp.js](/private/tmp/ax-desktop-webmcp-cli-20261112/desktop/packages/electron/src/native-webmcp.js:425) (lines 425–437), an invoke entry’s `acknowledged` promise is resolved only by `finish`. Its `reject` path clears the deadline and removes or retains the map entry, but never resolves that acknowledgement. The cancellation implementation at lines 580–597 clears the caller’s deadline, waits up to 500 ms for `acknowledged`, and, on `still-finishing`, rejects with `retain = true`.

Two deterministic failures follow:

- If `WebMCP.invokeTool` rejects after cancellation has begun, the invocation is definitively finished, yet cancellation consumes the full 500 ms and reports `still-finishing` instead of `stopped`.
- If `invokeTool` or its response never settles, cancellation rejects the caller but retains the entry with its deadline timer already cleared. No later timer removes it, so `pending.size` remains nonzero indefinitely. Subsequent invokes are rejected at lines 370–371, and subsequent read/act/wait operations are rejected at line 463, until navigation, document invalidation, or adapter close intervenes.

**Expected:** a definitive invoke failure acknowledges cancellation promptly, and a retained still-finishing invocation is purged by a finite deadline rather than blocking the adapter forever.
**Actual:** dead invocations can be reported as still finishing, and a wedged invocation can permanently consume the adapter’s single-operation slot on an unchanged document.

**Minimal fix:** resolve `entry.acknowledge()` when a non-retained rejection definitively ends dispatch. For a retained cancellation, preserve a finite purge timer—such as the request’s original deadline, capped consistently with the existing invoke bound—that deletes the retained pending entry if no real finish has arrived. Later finishes for that invocation should then be handled as bounded early/stale responses rather than reviving the entry.

**Deterministic regression test:** Mock `invokeTool` to remain unsettled, call `execute`, call `cancel`, advance past the acknowledgement window and the test’s finite purge deadline, and assert that `pending` becomes empty and a new invoke can be dispatched. In a second case, make `invokeTool` reject while cancellation is waiting and assert that the cancellation resolves as `stopped` without waiting for the full 500 ms; current behavior reports `still-finishing`.

## 4. Medium — Unconfirmed close destroys popups before discovering that the main document vetoes closure

The eviction probe in [browser-eviction.js](/private/tmp/ax-desktop-webmcp-cli-20261112/desktop/packages/electron/src/browser-eviction.js:47) (lines 47–67) is destructive: `closeForEviction` calls `contents.close()` and reports whether destruction or prevention occurred. In [desktop-webmcp-browser.js](/private/tmp/ax-desktop-webmcp-cli-20261112/desktop/packages/electron/src/desktop-webmcp-browser.js:446) (lines 446–451), the unconfirmed close path probes popup contents before the main contents, sequentially.

A concrete sequence is:

1. Invoke an internal unconfirmed close, eviction, or owner-recovery close for an entry with one popup.
2. The popup has no `beforeunload` veto, so the probe closes and destroys it.
3. The main page vetoes closure with `beforeunload`.
4. `closeEntry` throws `Browser page refused closure`, leaving the entry nominally alive, but the popup and any state it held have already been discarded.

**Expected:** a main-document veto leaves the entry’s document set intact, or all discardability checks complete before any document is destroyed.
**Actual:** closure can partially succeed: the main page survives, while its popup is irreversibly lost even though the close operation was refused.

**Minimal fix:** check/close the main document before any popup and run non-destructive discardability checks for every affected document before starting destructive closure. If the main document vetoes, return without touching popups. Any later popup veto should be surfaced as a partial-close state rather than pretending the original entry remains intact.

**Deterministic regression test:** Create a fake entry with a popup whose close succeeds and a main `WebContents` that emits `will-prevent-unload`. Call the unconfirmed close and assert both that it rejects and that the popup’s `close`/`destroy` path was not invoked. Current ordering destroys the popup before observing the main veto.
