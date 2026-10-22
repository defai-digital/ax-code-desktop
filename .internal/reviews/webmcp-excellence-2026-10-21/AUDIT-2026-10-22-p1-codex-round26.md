**1 P1 found. HEAD `96f74a34` does not satisfy the PRD’s fresh-audit requirement.** No files were modified.

1. **P1 — Sensitive-field diagnostics can expose credentials on screen and in checker reports.**

   Locations: `desktop/shared/webmcp-redaction.mjs:168`, `desktop/packages/ui/src/lib/webMcpDiagnosis.ts:210`, `desktop/packages/ui/src/components/mcp/WebMcpCallDiagnosis.tsx:114`, `desktop/packages/electron/scripts/webmcp-check-entry.cjs:31`.

   Reproduction: have a page tool return:

   ```json
   {
     "error": {
       "field": "password",
       "message": "Rejected value: DEMO_PRIVATE_VALUE",
       "got": "DEMO_PRIVATE_VALUE"
     }
   }
   ```

   Run it through **Try it**, or through `webmcp:check`. The shared redactor masks `got`, but retains the credential in `message`. The diagnostic helper consequently produces:

   ```json
   {
     "property": "password",
     "text": "Rejected value: DEMO_PRIVATE_VALUE"
   }
   ```

   Sensitive-field context only masks the enumerated value keys; it does not protect diagnostic prose under `message`, `constraint`, or `details`. A second redaction pass cannot recognize an ordinary password inside that prose.

   **Impact:** a validation error that echoes a password exposes it in Desktop’s result/diagnostic displays and the checker’s report file and output. The same problem affects ordinary API secrets without recognizable token prefixes.

   **Verification:** reproduced with the actual shared redactor and diagnostic helper. I also executed the actual checker entry with Electron and filesystem writes intercepted in memory: its serialized report retained `DEMO_PRIVATE_VALUE`, while correctly masking the submitted password and `got`.

**P2 findings:**

- **Address polling replaces executable address state with its display projection.** `desktop/packages/electron/src/desktop-webmcp-browser.js:593`; `desktop/packages/ui/src/components/layout/EmbeddedWebMcpBrowser.tsx:166`. Open `https://example.test/?token=abc`, then blur the address field and allow polling. Main returns `[redacted]`; the renderer assigns it to `url`, which **Go** subsequently submits. Reusing or editing the loaded address requires pasting the original again. Keep navigation state separate from the masked display.

- **Specific native initialization failures disappear at the renderer boundary.** `desktop/packages/electron/src/native-webmcp.js:153`; `desktop/packages/ui/src/components/layout/EmbeddedWebMcpBrowser.tsx:269`. Make `WebMCP.enable` fail or exceed its initialization deadline. The adapter generates a stage-specific reason, but the pane replaces it with generic `start-failed`. Recovery remains available, but users cannot distinguish unsupported WebMCP from a timeout or attach failure.

I inspected the requested source surfaces and traced the earlier safeguards for document/session binding, cancellation, definition replacement, approval receipts, schema projections, exports, close refusal, and browser ownership. Round-26 failure summaries, replay confirmation, waiting-page access, and grid controls are present; main still enforces one browser owner per project/session.

All **6,118 existing credential-text cases** and **1,595 structured-field cases** passed direct, memory-only checks. Those cases do not cover the P1 diagnostic-prose example above. This was a source audit with focused executable probes; native Electron UI journeys and the full test suites were not rerun.

