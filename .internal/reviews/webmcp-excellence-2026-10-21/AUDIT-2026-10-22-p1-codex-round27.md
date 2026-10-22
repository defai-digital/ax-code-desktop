**Audit result: 3 P1 findings at HEAD `1442693e`. PRD definition-of-done item 3 is not satisfied.** No files were modified.

1. **P1 — Diagnostic echoes can still expose passwords.**  
   `desktop/shared/webmcp-redaction.mjs:155` and `:206`

   The echo collector recognizes generic value keys such as `got` and `received`, but omits sensitive keys such as `password`, even though the projection subsequently masks those keys.

   **Reproduction:** Return this page-tool result:
   ```json
   {
     "error": {
       "field": "password",
       "details": {"password": "AUDIT_DEMO_VALUE"},
       "message": "Rejected AUDIT_DEMO_VALUE"
     }
   }
   ```
   Both `redactWebMcpReport()` and the actual manual-result IPC projection mask `details.password` while retaining `"Rejected AUDIT_DEMO_VALUE"`. The checker-report projection retains it too.

   **Impact:** A credential explicitly identified as a password reaches result previews, diagnostic displays, and checker report storage. Round 27 closes the `got` variant but leaves this nested sensitive-key variant open.

2. **P1 — Cancelling window closure can leave the native page and its controls bound to different sessions.**  
   `desktop/packages/electron/src/desktop-webmcp-browser.js:415` and `:489`

   Close recovery calls `reveal()` for every surviving page. Each call changes the native selected view, without notifying the renderer to select that session.

   **Reproduction:** Create pages A, then B in one window. Select A, interact with A so closure requires confirmation, close the owner window, then cancel. Recovery reveals A and subsequently B, leaving B visible while the renderer remains on A. Use A’s address bar or tool panel.

   A read-only probe against the actual controller reproduced:
   ```text
   Before: A visible, B hidden
   After cancellation: A hidden, B visible
   Renderer selection notifications: none
   A toolbar navigation changes hidden A; B remains visible
   ```

   **Impact:** The person sees B under A’s address, catalog, and session controls. Navigation, reload, and manual tool invocation can affect hidden A while the person watches B. Native ownership remains unique, but the displayed ownership becomes false.

3. **P1 — Primitive form inputs expose recognizable credentials under ordinary property names.**  
   `desktop/packages/ui/src/components/mcp/WebMcpToolPanel.tsx:390`

   `FieldInput` decides masking solely from `field.name`; it never checks the value.

   **Reproduction:** Register a tool with `headers: {type: "string"}`. Open **Try it** and paste `Authorization: Bearer AUDIT_DEMO_1234567890`. The shared redactor identifies that value as sensitive, but `headers` is not a sensitive name, so the control remains a plaintext input. Reopening the retained draft uses the same decision.

   **Impact:** Recognizable credentials appear on screen without an explicit reveal action. The primitive editor lacks the value-based masking already used by the JSON and address editors.

**P2 findings**

- `desktop/packages/ui/src/components/mcp/WebMcpToolPanel.tsx:866`: Switching between fields and JSON only toggles the mode; it does not synchronize their inputs. Enter fields, switch to JSON, and the editor still contains its independent `{}` draft. Switching back restores the separate field draft.
- `desktop/packages/ui/src/lib/webMcpToolForm.ts:30`: Property descriptions remain silently capped at 300 characters. Longer instructions are available through the schema display, but the field guidance omits their remainder.

**Verification:** Reviewed the requested source and supporting identity, projection, closure, and outcome paths. Earlier protections remain present, including document-bound dispatch, keyed checker receipts, bounded initialization, exact-definition evidence, and native-inventory-based pop-out exclusivity. The findings above qualify the redaction and recovery fixes.

All **22 standalone shared-redaction tests passed**. Additional read-only Node probes reproduced findings 1 and 2 and confirmed finding 3’s masking decision. Electron/UI suites could not load because this checkout lacks Vitest dependencies; no live-renderer verification is claimed.

