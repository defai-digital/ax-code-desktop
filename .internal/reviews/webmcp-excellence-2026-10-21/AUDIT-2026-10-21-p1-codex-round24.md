**Two P1 findings at `8ab24af3`. The PRD’s fresh-audit requirement does not pass.** No files were modified.

1. **P1 — Owner-renderer failure silently discards unsaved browser work.**  
   Locations: `desktop/packages/electron/src/desktop-webmcp-browser.js:503`, `:529`, `:443`.

   **Reproduction:** Open a page containing a textarea without a `beforeunload` handler, type an unsaved draft, then crash the Desktop owner renderer. Its `render-process-gone` event invokes `ownerGone()`, which calls `close(entry)` before attempting recovery. Closure checks Chromium’s unload veto but ignores both the recorded `possibleUnsavedWork` flag and editable-surface detection. Because the guest closes successfully, the recovery callback never runs.

   An in-memory reproduction against the current controller, after emitting recorded keyboard input, produced `guestDestroyed: true`, zero confirmations, zero recovery attempts, and zero retained pages.

   **Impact:** A recoverable Desktop renderer failure destroys the independently running browser document and its unsaved draft. Round 24 recovers vetoing pages, but pages without unload handlers remain vulnerable.

2. **P1 — Structured credential paths bypass redaction and input masking.**  
   Locations: `desktop/shared/webmcp-redaction.mjs:171`; `desktop/packages/ui/src/lib/toolHelpers.ts:298`; `desktop/packages/ui/src/components/mcp/WebMcpToolPanel.tsx:359`.

   **Reproduction:** Register a tool with a string property named `auth["sig"]`, enter an opaque signing secret, invoke it, and inspect retained input or **Copy test**. Alternatively, return that property in a checker result and use `--json`.

   The current shared functions preserve this value unchanged:

   ```js
   redactWebMcpReport(
     { 'auth["sig"]': "PRIVATE_DIAGNOSTIC" },
     "<fill in>"
   )
   // { 'auth["sig"]': "PRIVATE_DIAGNOSTIC" }
   ```

   Direct object keys and field masking use the raw name regex, whereas assignment text and diagnostic paths use the stronger path parser. The same mismatch affects `signature[0]`, `auth.sig.value`, and `auth["key.pair.id"]`.

   **Impact:** Credentials appear in plaintext form controls and can survive journal retention, regression exports, and checker report storage/output. Round 24 correctly filters `auth["sig"] = …` and diagnostic `{field, got}` shapes, but equivalent structured property keys remain exposed.

**P2:** `desktop/packages/ui/src/stores/useWebMcpApprovalOutcome.ts:34` accepts only the literal permission `"webmcp"`. The shared permission predicate also recognizes qualified names such as `"provider.desktop_webmcp"`. Such an approval can render correctly while its receipt is discarded, leaving completed-call input and definition evidence unavailable after approval removal. Use the shared predicate here too.

**Verification:** Reviewed the requested source, documentation, checker paths, and branch change. The shared redaction suite passed **16/16 tests**, including bracket assignments and inherited diagnostic sensitivity. Targeted in-memory probes reproduced both P1s. No additional approval bypass, wrong-session dispatch, or duplicate browser ownership was confirmed. Vitest execution was blocked before tests ran because its transform runner requires a temporary directory forbidden by this read-only environment; native UI journeys were not rerun.

