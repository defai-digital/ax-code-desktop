**Audit result: 2 P1 findings. PRD definition-of-done item 3 is not satisfied at `dd6b4bf6`.**

Read-only review of the requested source, documentation and branch changes. No files were modified; runtime/version-pin changes were excluded.

1. **P1 — Credentials in header-entry arrays bypass redaction.**

   Locations: `desktop/shared/webmcp-redaction.mjs:115`, `desktop/packages/ui/src/lib/toolHelpers.ts:346`, `desktop/packages/electron/scripts/webmcp-check-entry.cjs:31`.

   **Reproduction:** Register a tool returning:
   ```js
   JSON.stringify({
     headers: [["x-api-key", "audit-only-private-value"]]
   })
   ```
   Invoke it through **Try it**, or through `webmcp:check`.

   Arrays are processed element by element, so the credential name never supplies context for its adjacent value. The main-process display projection and checker report projection both retain the complete credential. The renderer’s result-preview traversal has the same gap. This is a conventional representation produced by `Array.from(headers.entries())`.

   **Impact:** An ordinary opaque API credential appears in the result UI and is written into the checker’s temporary report and printed output. Existing sensitive-object-key and credential-shape filtering does not cover this explicit credential context. Confirmed with in-memory probes against the current redactor and manual-result projection.

2. **P1 — Accepted manual-form fields silently lose unsaved drafts.**

   Locations: `desktop/packages/ui/src/stores/useWebMcpBrowserStore.ts:501` and `:510`; save path: `desktop/packages/ui/src/components/mcp/WebMcpToolPanel.tsx:592`.

   **Reproduction:** Register an object schema with a string property named `"x".repeat(257)`. Open its manual form, enter a draft, then collapse and reopen the outer **Page tools** panel.

   Native registration and form construction accept this property, but `boundRecord` silently discards keys longer than 256 characters. Remounting the tool restores an empty field. An own property named `__proto__` also loses its draft because the storage helpers assign into ordinary `{}` objects. `boundFlags` similarly loses the explicit-empty selection.

   **Impact:** A person loses entered work without changing the tool definition, navigating, or receiving a warning. Confirmed that native registration and input construction accept both names while the actual draft-bounding helpers discard them.

**P2:** Advisory diagnosis checks truncated display values rather than complete recorded input. At `desktop/packages/ui/src/components/mcp/WebMcpToolPanel.tsx:280` and `:339`, `webMcpDisplaySchema` shortens strings before validation. With `maxLength: 4500` and a recorded 5,000-character value, the diagnosis receives 4,000 characters and misses the violation. The reverse produces false minimum-length warnings. Confirmed with the current projection and constraint-checking functions; execution outcomes remain separately classified.

The reviewed source contains the stated identity, stale-definition, cancellation, closure, approval-preview, full-turn recap and single-browser-owner protections. Round 19’s exact manual-evidence matching, original-property sensitivity handling and unknown-association suppression are present. The findings above remain outside those protections.

**Validation limitation:** Seven targeted Vitest suites were attempted, but all stopped before executing tests because the read-only sandbox rejected a temporary-directory creation. Findings rely on source tracing and successful, non-writing Node probes. No native Electron journey was run.

