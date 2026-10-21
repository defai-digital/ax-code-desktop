**Found 2 P1s and 1 P2 at `e9a9b5e6`. The fresh-audit requirement is not satisfied.** No files were modified.

1. **P1 — Generated form constraints expose a credential hidden by the schema projection.**  
   Paths: `desktop/packages/ui/src/components/mcp/WebMcpToolPanel.tsx:564` and `:618`; `desktop/packages/ui/src/lib/webMcpToolForm.ts:25`.

   **Reproduction:** Register a tool with:
   ```json
   {"type":"object","properties":{"pin":{"type":"integer","minimum":123456,"maximum":123456}}}
   ```
   Open its generated form. The display schema correctly replaces the entire `pin` definition with `[redacted]`, and the input is password-masked. However, the form reads the untouched `executionSchema` and displays both numeric constraints as `123456`. `constraintText` supplies sensitive-field context only for `default` and `enum`, dropping it for `minimum`, `maximum`, and other constraints.

   **Impact:** A credential embedded in a sensitive property’s constraints appears on screen despite the original-schema redaction and numeric-input masking. An in-memory probe using the actual projection, form, and preview helpers reproduced this output.

2. **P1 — Registration-history eviction turns a completed call into a false “never called” claim.**  
   Paths: `desktop/packages/ui/src/components/views/git/ReviewLandingBrowserEvidence.tsx:98`; `desktop/packages/ui/src/lib/webMcpCalls.ts:128`; `desktop/packages/ui/src/lib/webMcpCatalog.ts:275` and `:316`.

   **Reproduction:** Let the agent successfully invoke `add_task`. During the same turn, re-register that same tool with 33 successive description edits, allowing each catalog update to be observed. Its main-issued tool ID remains unchanged, but the original definition falls outside the 32-event history. Open or copy the landing recap.

   Digest resolution now returns no definition, so the historical call loses its projected `invocationID`. The recap treats that missing association as proof that the current tool was never called. The probe produced:
   ```text
   stableID=true, callOutcome=ok, resolvedID=null,
   reportedNeverCalled=["add_task"]
   ```

   **Impact:** Displayed and copied evidence contradicts an actual completed invocation. Comparison also loses the association. Missing historical identity needs an “unknown” treatment or a retained call-to-tool binding, rather than a negative claim.

3. **P2 — Tool identity retention is unbounded.**  
   Path: `desktop/shared/webmcp-catalog-projection.cjs:37`.

   Repeatedly register different tool names and let status projection observe them. Every name remains in the view’s identity map after removal or navigation, and each new identity scans all retained entries to calculate its placeholder ordinal. A probe retained 1,000 identities with only one tool in the current catalog. Long-lived builder sessions accumulate memory and increasing projection work.

The inspected source contains the reported safeguards for document-bound dispatch, cancellation, self-unregistering tools, approval metadata, opaque identities, bounded schema/history displays, checker receipts and timeout contamination, popup waiting, close confirmations, and shutdown refusal. The grid pop-out path reserves ownership before opening another window; main also rejects duplicate project/session ownership. I established no additional P1 in those paths.

Validation was source review plus read-only, in-memory reproductions. Vitest could not start because the sandbox denied its temporary SSR directory; native UI journeys were not rerun. Excluded runtime/version-pin changes were not assessed.

