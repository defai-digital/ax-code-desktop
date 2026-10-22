**Two P1 findings at HEAD `e36aad55`. The PRD’s fresh-audit criterion is not met.** No files were modified.

1. **P1 — Numeric credential echoes escape redaction.**  
   Locations: `desktop/shared/webmcp-redaction.mjs:219`; display path: `desktop/packages/ui/src/lib/toolHelpers.ts:324`.

   **Reproduction:** Have a page tool return:
   ```json
   {"error":{"field":"pin","got":731924,"observed":731924}}
   ```
   Calling `webMcpDisplayReport()` produces:
   ```json
   {"error":{"field":"pin","got":"[redacted]","observed":731924}}
   ```
   The redactor collects numeric secrets but applies echo matching only to strings. Numbers under another key, including array elements, pass through unchanged. The result preview also preserves these numbers.

   **Impact:** A PIN, OTP or numeric CVV can appear in manual results and checker reports despite its sensitive field being identified. This is a remaining gap in round 28: the equivalent string echo is correctly masked.

2. **P1 — Redaction can turn a failed checker run into success.**  
   Locations: `desktop/packages/electron/scripts/webmcp-check-entry.cjs:31`; `desktop/packages/electron/scripts/webmcp-check-lib.mjs:97` and `:130`.

   **Reproduction:** Register `validate`, invoke it with `{"password":"failed"}`, and return:
   ```json
   {"field":"password","got":"failed","status":"failed"}
   ```
   The original result is correctly classified by `manualToolResult()` as `application-error`. Before writing the report, redaction masks both `got` and the matching `status` value. `evaluateReport()` subsequently classifies that sanitized output as `completed`.

   An in-memory reproduction using the real keyed identity/input receipts returned **`exitCode: 0`, `problems: []`, `outcome: "completed"`**.

   **Impact:** `webmcp:check` can falsely pass a failed tool and supply misleading CI evidence. Preserve a fixed outcome classified from the original result before redaction; do not reconstruct success from display projections.

**P2 findings:**

- `desktop/shared/webmcp-catalog-projection.cjs:89`: Tool identity expires after 33 absent catalog projections, even without capacity pressure. Removing and re-registering an identical tool then produces the same native definition digest but a different invocation ID. Confirmed with the real projection helper. Existing drafts, replay and comparison associations become unavailable unnecessarily.
- `desktop/packages/ui/src/components/views/git/ReviewLandingBrowserEvidence.tsx:75`: A turn containing only reads or element actions suppresses the entire “tools never called” list. With registered tools available, the recap omits precisely the evidence useful for explaining why the agent bypassed them.

**Verification and limits:** Reviewed the requested source paths and existing repair guards. Read-only probes passed for self-unregistering call completion, removed-definition rejection, native initialization deadlines, sensitive pair/path/nested-field filtering, OAuth callback filtering, and timeout/cancellation/structured-error classification. Both P1s above were reproduced through current production helpers. Native Electron journeys and Vitest were not run; this checkout has no installed test dependencies. Pop-out source retains a single main-process browser owner, with foreign-window creation returning an owner-focus handle.

