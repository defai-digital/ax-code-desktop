# Round 29 repair and self-audit

Scope: the two P1 and two P2 findings supplied for round 28, plus their result consumers.
Worktree: branch `r29`, base `e4da93ca` (the documentation follow-up to `e36aad55`).
All implementation changes remain uncommitted. No accepted PRD, ADR or specification was changed.

## Findings closed

- **P1: scalar credential echoes.** The shared redactor collects masked scalar values as strings and applies the same echo matcher to scalar leaves, including array elements. Tests cover numbers, zero, negative/fractional numbers, booleans, bigints, string forms and cross-type echoes, nested arrays/objects, descendant sensitive keys/value pairs, and null/undefined/symbol/non-finite values. Echo matching remains confined to the sensitive diagnostic context. The shared display projection, UI result preview, mounted manual result and retained journal have executable coverage.
- **P1: false checker success after redaction.** `recordCheckRun` classifies the original output before projection, then stores the outcome with keyed input and outcome receipts. `redactCheckReport` projects diagnostics separately from trusted classification metadata. Entry disk writes, launcher reads and evaluation use that projection. Evaluation validates the stored outcome/receipt; a missing or invalid outcome fails closed. It never classifies sanitized output. Main classifies manual results before projecting only their output; the UI uses the returned outcome for the displayed result, last-run record, journal, comparison and regression export. Missing outcome metadata is uncertain.
- **P2: identity expiration.** Absent identities are retained until the 256-entry capacity cap requires eviction. Identical re-registration after 100 absent projections retains the definition digest and invocation ID. Existing 1,000-round churn coverage still verifies the cap and stable live labels.
- **P2: never-called recap.** Registered tools remain visible as never called on read-only, element-action-only, navigation-only, listing-only and no-browser-call turns, including copied evidence. Existing protections for genuinely unknown invocation associations remain intact: an unknown association is reported rather than falsely claiming that a possibly invoked tool was never called.

## Outcome derivation and consumer inventory

Searched production sources with `rg` for `manualToolResult`, `manualToolFailure`, `desktopWebMcpResultOutcome`, `desktopWebMcpResultFailed`, `recordCheckRun`, `recordedPageOutcome`, outcome assignments and native rejection/status mappings. Test files and generated output were excluded. The raw search is retained at `/tmp/r29-outcome-grep.txt`.

Every WebMCP outcome derivation or mapping found is listed here; type declarations, imports and copies are identified separately from classification.

| Source | Derivation or consumption | Redaction order |
| --- | --- | --- |
| `desktop/shared/webmcp-manual-outcome.cjs:27` | `manualToolResult`: original JSON/string/untrusted-envelope result; explicit timeout/cancellation before application-error signals, then completed | Original result only |
| `desktop/shared/webmcp-manual-outcome.cjs:61` | `manualToolFailure`: allowlisted adapter outcome/reason, otherwise uncertain/provider-gone | Adapter metadata only; no page exception text |
| `desktop/packages/electron/src/native-webmcp.js:26,342-437,481,543-572` | `invocationError`, invocation completion, deadline, size/input/definition checks and cancellation acknowledgement map native transport/admission state to failed/application-error/timeout/cancelled/uncertain | Native state before display projection; does not classify redacted output |
| `desktop/packages/electron/scripts/webmcp-check-receipt.cjs:35` | `recordCheckRun`: original transport error/missing result -> failed; otherwise shared original-result classifier; stores outcome and receipts | Before any report redaction |
| `desktop/packages/electron/scripts/webmcp-check-entry.cjs:30,140` | Records the original result through `recordCheckRun`; every disk write uses `redactCheckReport` | Fixed outcome attached alongside projected payload |
| `desktop/packages/electron/scripts/webmcp-check-receipt.cjs:29,45` | `runOutcomeReceipt` binds occurrence/input receipt/outcome; `redactCheckReport` preserves allowlisted outcome and receipts | Projection only; no classification |
| `desktop/packages/electron/scripts/webmcp-check-lib.mjs:95,125-132` | Validates stored outcome and receipt, copies the stored outcome, rejects missing/invalid classification or missing result as failed | No result classifier remains in evaluation |
| `desktop/packages/electron/scripts/webmcp-check.mjs:67-90` | Launcher reads with `redactCheckReport`; prints evaluation's stored run outcomes and derives aggregate exit status | Never classifies a result payload |
| `desktop/packages/electron/src/desktop-webmcp-browser.js:835,1491,1505-1510` | Agent failure mapping uses adapter metadata; manual admission -> stale-form; manual original result uses shared classifier; native rejection uses shared failure mapper | Manual output alone is projected after classification |
| `desktop/packages/ui/src/components/mcp/WebMcpToolPanel.tsx:197` | `recordedPageOutcome` maps an already-classified agent call and stored reason into the regression-export vocabulary | No payload inspection |
| `desktop/packages/ui/src/components/mcp/WebMcpToolPanel.tsx:594-702` | Local form admission -> stale-form/invalid-input/input-too-large; IPC loss or absent outcome -> uncertain; otherwise consumes `reply.outcome` | Display, last-run record and journal all receive the same fixed outcome; payload is previewed separately |
| `desktop/packages/ui/src/stores/useWebMcpBrowserStore.ts:334,361` | Stores supplied run/journal outcomes; redacts text/input/rejections separately | No outcome reconstruction |
| `desktop/packages/ui/src/lib/toolHelpers.ts:535,570` | `desktopWebMcpResultOutcome` classifies original runtime transcript state/output; `desktopWebMcpResultFailed` is its boolean wrapper | Original transcript state, before Desktop preview formatting; no manual projected-reply caller remains |
| `desktop/packages/ui/src/lib/webMcpCalls.ts:143,151` | Classifies original transcript state, then stores running/ok/failed/checkpointed/cancelled in the call projection | Result preview is generated after classification; recap/strip/comparison consume that stored call outcome |
| `desktop/packages/ui/src/components/chat/message/parts/ToolPart-impl.tsx:1040-1041` | Uses the transcript classifier on original runtime state for the transcript row | Before display formatting; never consumes the manual/checker projection |
| `desktop/packages/ui/src/lib/webMcpDiagnosis.ts:156-172,181` | Regression export copies the stored expected outcome; generated standalone code classifies a **new original live result** and compares it with that stored expectation | Does not infer an expected outcome from retained preview text |
| `desktop/packages/ui/src/lib/webMcpCalls.ts:188` | `webMcpCallOutcomeKey` maps stored enum to localization key | Display mapping only |
| `desktop/packages/ui/src/stores/useWebMcpApprovalOutcome.ts:8` | Separate approval lifecycle: pending/answered/unanswered | Does not derive a tool-result outcome |

Other grep hits in native journey scripts are harness run summaries or DOM outcome readbacks, not page-result classifiers. The Electron `webmcp-manual-outcome.js` file only re-exports the shared classifier. Recap, call strip, journal replay, comparisons and exports were checked for payload-based reclassification; none reconstruct an outcome from redacted data.

## Regression sensitivity

For each check below, only the named production file was temporarily replaced with its `HEAD` version; new behavioral tests were kept. The repaired bytes were restored in a `finally` block. All five checks exited 1 as expected, then the restored implementation passed the focused suites.

| Original implementation | New regression failures |
| --- | --- |
| Shared redactor | Scalar/cross-type echoes, descendant numeric echoes and other primitive echoes fail |
| Checker evaluator | Four masked-status cases and missing-outcome case fail (5) |
| Catalog projection | Identical re-registration after absent projections fails (1) |
| Recap | Read/act/navigate/list/no-call coverage fails (5) |
| Manual UI consumer | Conflicting projected result overrides stored completed outcome, and missing outcome becomes completed (2) |

Logs: `/tmp/r29-baseline-summary.txt` and `/tmp/r29-baseline-*.log`. Tests exercise production helpers and rendered DOM; new UI tests use `src/test/dom.tsx`. No source-as-text tests were added.

## Verification

- `node --test desktop/shared/webmcp-redaction.test.mjs`: 27 passed.
- Focused Electron suites (checker entry/lib/launcher/redaction, shared manual mapping, browser controller): 305 passed across 6 files. The checker-library fixture cleanup was followed by another 20/20 pass.
- Focused UI suites (preview, manual panel, recap): 237 passed across 3 files.
- Full UI suite: 4,857 passed across 650 files.
- `pnpm run typecheck`: passed.
- `pnpm run lint`: passed.
- `node --import tsx script/check-desktop-boundaries.ts --fail-on-violation`: passed.
- `pnpm run build`: passed, including native module rebuild.
- `project-browser-tasks.mjs`: passed; W3 3/12, W4 3/10, W6 5/8, W8 13/15 actions. Native evidence: `/tmp/r29-native-tasks/`; log: `/tmp/r29-native-tasks.log`.
- `project-browser-webmcp.mjs`: passed; W1 discovery and W2 manual error/success each 5 actions, keyboard takeover, second-window ownership, independent project storage, hidden-call wait/revocation, 50 session switches and grid continuity. Native evidence: `/tmp/r29-native-webmcp/`; log: `/tmp/r29-native-webmcp.log`.
- Additional real native checker reproduction: failed/timeout/cancelled/completed status values all became `[redacted]` while the original outcomes remained application-error/timeout/cancelled/completed. Numeric PIN echoes in objects and arrays were absent. The combined run correctly exited 3. Evidence: `/tmp/r29-native-check.json`, `/tmp/r29-native-check.log`, runnable fixture `/tmp/r29-native-check.mjs`.
- `git diff --check`: passed. Branch remains `r29`; no commit created.

## Self-audit result and limits

No remaining P1 was found in the four requested repair classes after the final implementation. Checks included original-versus-projected classification, keyed receipt integrity/occurrence order, invalid or absent outcomes, repeated redaction, primitive echo collection/traversal, context isolation, capacity-only identity eviction and displayed/copied recap coverage. The native screenshots and DOM assertions provide rendered evidence; `w3.png` was also visually inspected.

This is a scoped local self-audit, not a claim that all excellence rubric, independent-judge, cross-platform CI or release gates are satisfied. The W4 native harness explicitly uses scripted stub expiry; signed runtime timer qualification is not established by that journey.

New `en.ts` strings: **none**. No English UI fallback was added.
