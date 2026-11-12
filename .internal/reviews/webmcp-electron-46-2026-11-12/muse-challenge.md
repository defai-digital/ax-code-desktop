## Withdrawn findings

**1. Close-confirmation generation.** Withdrawn. The explicit test establishes intended policy: approval binds to the same page/WebContents identity across URL and revision changes. Only a replacement WebContents requires another prompt.

**2. Busy invocation after unconfirmed cancellation.** Withdrawn as a request to purge or expire the invocation. Retaining it is a safety property: another operation must not run against a document that may still be executing. The only remaining investigation is narrow—whether acknowledgement can be resolved when dispatch failure is *provably pre-dispatch*. A generic CDP rejection remains ambiguous and must not release exclusivity.

**4. Popup partial close.** Withdrawn. The existing all-document, non-destructive `authorizeClose` pass already addresses the stated risk before destructive closure. A handler installed after authorization creates an inherent race, but without a reachable policy bypass it does not demonstrate that unapproved popup work can be destroyed, and atomic multi-`WebContents` closure is not generally available.

## Confirmed fixes

### 3. Initialization failure vetoed during cleanup

Yes—the proposed repair is minimal and consistent, provided retained state is treated as a degraded live pane, not as successful initialization.

Necessary handling:

- Distinguish three outcomes: successful close, vetoed close with a live guest, and guest destruction during cleanup. Only the vetoed/live outcome retains the entry.
- Return the retained entry’s existing status/ID with the existing safe error representation and `nativeAvailable=false`. Do not expose the raw initialization error or claim readiness.
- Gate adapter/CDP commands while retained; permit listing/status and the existing explicitly confirmed close path. Partial adapter startup must be stopped or quarantined so it cannot later become active silently.
- Keep the entry in `views`/`shown`, ensure the `finally` path can make it visible when it remains selected, and maintain child-view add/remove pairing.
- Register profile ownership for the retained guest; otherwise another creation could compete for the same profile. Release ownership through the normal close/cleanup path, including owner-window destruction and spontaneous guest exit.
- While retained, subsequent create attempts must surface or reuse that same entry rather than create another guest for the partition. After explicit close fully removes it, the next create must construct a fresh adapter.
- Preserve any remembered recovery information until the retained pane is explicitly closed or a later initialization succeeds, so retry does not silently lose the original target.
- Make retention idempotent against races: guest exit between the veto check and retention, close called twice, owner destruction during retention, and initialization failure occurring before a guest exists.

Ordinary initialization failures without a veto must retain current behavior: clean up and reject without acquiring profile ownership.

### 5. Utility process not yet spawned

Keep `forceStopUtilityProcess(child, options)` synchronous and handle-bound, but add a module-level `WeakSet` of children with a pending force-stop:

1. If `child.pid` is currently a valid positive integer, retain current behavior: read it at dispatch time and send `SIGKILL` to that PID.
2. If the PID is unavailable, call `child.kill()` as today. If that does not stop it and the child has not exited, register one pending request:
   - `spawn` handler: remove both pending listeners, clear the pending marker, then re-run the force-stop logic against the same child handle and read `child.pid` only at that moment.
   - `exit` handler: remove the `spawn` listener, clear the marker, and perform no kill.
3. If the child is already in the pending set, return without adding duplicate listeners or timers.
4. Guard completion with a single settled flag so `spawn`/`exit` races cannot kill twice or leak listeners.
5. Never store a PID for later use; a PID appearing at spawn is read fresh, avoiding a captured or reused identifier.

Required cases: PID absent at request then present at spawn; repeated requests before spawn; exit before spawn; already-running child; and listener counts returning to their prior values after either completion path.
