**Audit result: 3 P1 findings at `25c5ee981a5ae2b37848930e51d3c478e6b57dd9`. The “no P1” gate is not met.** No files were modified.

1. **P1 — Structured approval arguments bypass the new pair redaction.**  
   `desktop/packages/ui/src/lib/toolHelpers.ts:478`; displayed directly by `desktop/packages/ui/src/components/chat/PermissionCard.tsx:480`.

   **Reproduction:** Supply invoke metadata with:
   ```json
   {"operation":"invoke","arguments":{"headers":[["Authorization","synthetic-private-value"]]}}
   ```
   `describeWebMcpCall(...).argumentsText` contains the credential unchanged. `{name:"password",value:"synthetic-private-value"}` leaks through the same path. This branch calls `redactJsonValue` directly, bypassing the shared redactor that understands sensitive pairs.

   **Impact:** Credentials appear in approval cards and argument summaries, including the call strip and comparison panel. The supported `metadata.arguments`/`metadata.input` path is affected; the `inputPreview` path has the new protection. Confirmed by executing the current helper.

2. **P1 — The documented validation-error format exposes sensitive rejected values.**  
   `desktop/shared/webmcp-redaction.mjs:126`; propagated through `desktop/packages/electron/src/desktop-webmcp-browser.js:1377` and persisted by `desktop/packages/electron/scripts/webmcp-check-entry.cjs:31`.

   **Reproduction:** Register a password-taking tool that returns:
   ```json
   {"error":{"field":"password","constraint":"minLength","got":"synthetic-private-value"}}
   ```
   Run it using **Try it**, or through `webmcp:check --json`. This follows the `{error:{field,constraint,got}}` format recommended at `docs/webmcp-page-tools.md:151`.

   **Impact:** The password survives the main-process display projection, result preview, and checker report redaction. It can appear on screen and in the checker’s temporary report and printed JSON. Sensitivity propagates from `name`/`key` to `value`, but not from `field` to `got`. Confirmed with the current redaction and preview functions.

3. **P1 — Complete agent inputs are silently shortened, producing false diagnosis and incorrect regression exports.**  
   `desktop/packages/ui/src/lib/toolHelpers.ts:443`; false finding generated at `desktop/packages/ui/src/lib/webMcpDiagnosis.ts:64`.

   **Reproduction:** Register an object schema with integer properties `p0` through `p128`, requiring `p128`. Supply a complete runtime `inputPreview` containing all 129 properties with value `0`. This JSON is only **1,052 bytes**, below the documented runtime preview limit.

   `readWebMcpInvokeInput` retains only the first 128 properties while still reporting `kind: "preview"`. Diagnosis then returns:
   ```json
   {"property":"p128","rule":"required","valueKind":"absent"}
   ```

   **Impact:** The UI falsely says the agent omitted a supplied required property. Regression export also consumes the shortened input, so its copied test/command omits that property and does not reproduce the recorded call. Confirmed by executing the current input-projection and diagnosis functions.

**P2:** No additional independently verified P2 findings.

The reviewed source contains the earlier document/session binding, cancellation, stale-definition, closure-confirmation, checker receipt, and browser ownership protections. In particular, main-process creation rejects a second window owning the same project/session browser; pop-out does not create a second owner. Those source checks do not constitute native UI qualification.

Validation: **9/9 standalone shared-redaction tests passed**, and the three reproductions above ran in memory against current source. Vitest could not initialize because the read-only environment denied temporary-directory creation; no native Electron journey was run. Version-pin files were excluded as requested.

