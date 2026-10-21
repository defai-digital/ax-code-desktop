## Review: batch permission decisions (CS-13)

No HIGH/blocking issue. The two-step arm, the `armed !== decision` re-arm rule, and the synchronous `phase` guard in `submitRequestDecision` (useRequestDecisionStore.ts:75) do prevent double submits for the same request, and questions are never batched (batchRequests.ts:19). Read-only: no files changed; I ran no commands (no shell in this session), so all findings are source-read, not test-verified.

**1. LOW-MEDIUM — Armed signature omits sessionId.** `batchRequests.ts` / `PermissionBatchBar.tsx:20`
`ids` = request ids only, while the canonical key (`useRequestDecisionStore.ts:16`) is `[kind, sessionId, requestId]`. Request ids are per-session (`perm_1`); if session A's request is answered and session B's same-id request arrives, count and signature are unchanged, so the armed decision survives a set swap and can confirm a request the user never saw. Fix: `${sessionId}:${requestId}` per entry, and store the armed signature, requiring `armed.ids === ids` synchronously inside `decide` (the `useEffect` at :23-25 is effect-timed, so the guard is currently render-order dependent).

**2. MEDIUM — No reply bound, group can lock forever.** `PermissionBatchBar.tsx:35-44`
`submitRequestDecision` awaits `permission.reply` unbounded (`session-actions.ts:1124`); only `waitForConnectionOrThrow` is capped (2 s). A stalled runtime leaves the record at `sending`, so both batch buttons *and every member card* (`RequestActionCard.tsx:46` busy) stay disabled, and the bar never disarms. The in-session card already fixes this class with a 20 s `withTimeout` (`PermissionCard.tsx:78,108`). Fix: bound the batch submit and let reconcile mark `uncertain`.

**3. MEDIUM — Grouping by permission name hides scope and risk.** `batchRequests.ts:20-24`
`patterns` carry the real blast radius (`["git status"]` vs `["rm -rf build"]`); two such bash asks become "Allow all 2 once" with neither scope nor risk surfaced. `interactiveOnly` (must-decide; runtime refuses standing grants, see `canAlwaysAllow`) is batched too, contradicting the badge/Card policy. Fix: exclude `interactiveOnly` and `riskClass === "risk"` (or group by permission+patterns+risk) and show the pattern union in the armed state.

**4. MEDIUM — Partial failure is silent at group level.** `PermissionBatchBar.tsx:29-43`
`submitRequestDecision` returns `void` and silently no-ops for entries in `accepted`/`sending`/`uncertain`, so `Promise.all` reports nothing; the bar resets to "Allow all N once" without saying what happened. Mission Control sets the precedent ("Archived: 1. Failed: 2."). Fix: return per-entry outcome, render a `role="status"` summary, and exclude non-idle entries from the batch.

**5. LOW — Armed state not announced.** `PermissionBatchBar.tsx:46-79`
No live region, no `aria-busy`; AT users get no signal that a second activation commits, and disabled-while-sending is unexplained. Fix: polite live region + `aria-busy={sending}`.

**6. LOW — Ordering/copy/test gaps.** `batchRequests.ts:31` claims inbox urgency order but receives raw `requests`, not the risk-ranked groups; `en.ts:3148` renders "from 1 sessions"; tests (`PermissionBatchBar.test.tsx:7`) mock the store, so idempotency, same-count swaps, partial failure, and risk exclusion are unproven.