**Two P1 findings at `5ef139d8`. PRD definition-of-done item 3 does not pass.** No files were modified.

1. **P1 — Indexed credential paths leak rejected values.**  
   **Location:** `desktop/shared/webmcp-redaction.mjs:89` and `:94`.

   **Reproduction:** Have a page tool return:
   ```json
   {"error":{"path":["recoveryCodes",0],"got":"946281"}}
   ```
   Equivalent forms using `"instancePath":"/recoveryCodes/0"` or `"path":"recoveryCodes[0]"` also reproduce it.

   The redactor examines only the final path component. A numeric component either returns false immediately or replaces the credential field name during path extraction. The sibling `got` value consequently remains unfiltered.

   **Verified:** Read-only Node probes through `manualToolResult()` → `webMcpDisplayReport()` retained `946281`. The checker’s `redactWebMcpReport()` serialization retained it too; that serialization is written at `desktop/packages/electron/scripts/webmcp-check-entry.cjs:31`.

   **Impact:** Recovery codes, password-array elements and similar credentials can appear in manual results and checker reports on disk, despite their explicitly sensitive field paths.

2. **P1 — Structured credentials remain visible in the JSON input editor.**  
   **Location:** `desktop/packages/ui/src/components/mcp/WebMcpToolPanel.tsx:500`; masking is applied at `:807`.

   **Reproduction:** Open Try it for a tool accepting a generic `fields` array, then enter:
   ```json
   {"fields":[{"name":"password","value":"canary-ordinary-value"}]}
   ```
   This pair representation also reproduces it:
   ```json
   {"fields":[["password","canary-ordinary-value"]]}
   ```

   `jsonSensitive` uses schema-property inspection plus `webMcpTextLooksSensitive()`. Neither recognizes these structured credential associations when the schema has generic property names. It evaluates to false, leaving the raw textarea visible without the person choosing **Show JSON input**.

   **Verified:** Both predicates returned false in direct probes, while the shared `redactWebMcpReport()` correctly removed the same credential values. The editor therefore bypasses the structured sensitivity detection already available.

   **Impact:** A password entered through a supported name/value representation is exposed on screen, including during screen sharing or screenshot capture.

**P2**

- **Synchronous redaction has superlinear cost on ordinary prose.** `desktop/shared/webmcp-redaction.mjs:71`: the assignment regex repeatedly scans whitespace-separated text without assignments. Direct measurements were approximately 62 ms for 16,000 characters, 185 ms for 32,000, and 1,177 ms for 64,000. A permitted near-64-KiB result can block the main thread during filtering; repeated display filtering compounds the delay. It recovers, so this is P2.

**Verification and scope**

Reviewed the controlling PRD, `main..HEAD`, and the requested source/documentation paths. Source tracing retained the earlier safeguards for request identity, queued-navigation document binding, cancellation during visibility waits, definition replacement, opaque tool identity, approval receipts, bounded evidence, uncertain-outcome exports, origin-only history, close confirmation, eviction and shutdown refusal. Main-process ownership checks also prevent a pop-out window from acquiring a second browser for the same project/session.

The existing shared-redaction suite passed **12/12**. The probes above expose gaps outside that coverage. Native Electron journeys and rendered UI tests were not rerun; these findings are supported by executable helper reproductions and source tracing. No additional P1 was established in the reviewed paths.

