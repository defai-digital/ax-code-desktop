**Audit result: 2 P1 findings at `d67e9a01`. DoD item 3 is not satisfied.** No files were modified; version pins were excluded.

1. **P1 — Registration diffs expose credential values.**  
   Locations: `desktop/packages/ui/src/components/mcp/WebMcpToolPanel.tsx:1044`; `desktop/packages/ui/src/lib/webMcpPropertyDiff.ts:13–14`.

   **Reproduction:** Register a tool with `properties.password = { type: "string", enum: ["synthetic-old-password"] }`. Let the catalog refresh, then re-register it with `enum: ["synthetic-new-password"]`. Open **Page tools → Registration**.

   The diff moves each password schema into generic `before` and `after` objects. Redaction then sees `enum` values without their sensitive property-name context. Both passwords appear in the diff. The ordinary schema block correctly hides the same values.

   **Impact:** Credentials contained in sensitive fields’ schema values can appear on screen and in screenshots. An in-memory reproduction using the actual projection, diff and redaction functions confirmed both values survive.

2. **P1 — Bounded schema keys can remove the context needed to redact credentials.**  
   Locations: `desktop/shared/webmcp-redaction.mjs:167`; `desktop/packages/electron/src/desktop-webmcp-browser.js:70`; `desktop/packages/ui/src/components/mcp/WebMcpToolPanel.tsx:98`.

   **Reproduction:** Register a tool whose schema contains a property named `"x".repeat(4000) + "password"`, with `{ type: "string", default: "synthetic-password" }`. Open its **Input schema**.

   The main-process display projection truncates the property name to 4,000 characters, removing `password`, while preserving the default. The subsequent renderer redaction sees an innocuous key and displays the credential. This definition fits within the adapter’s 32 KiB definition limit.

   **Impact:** A credential hidden by filtering the original schema becomes visible after display projection. The actual `projectToolCatalog` → renderer-redaction sequence reproduced `credentialVisible: true`.

   Both findings require preserving sensitive-field context through display transformations, while keeping executable schemas separate.

**P2 findings:**

- `desktop/packages/ui/src/lib/webMcpPropertyDiff.ts:11`: Property-level changes only compare `type`, `enum`, `description` and requiredness. Changing only `minimum`, `maximum`, `minLength`, `maxLength` or `default` produces no property-diff entry, reducing the usefulness of registration diagnostics.
- `desktop/packages/ui/src/lib/webMcpCatalog.ts:336–341`: Stale-run tracking still indexes catalog entries by displayed name, although round 19 stores manual runs under invocation ID plus definition digest. Those entries are skipped, leaving the stale-tracking mechanism inconsistent with the new identity scheme.

Source tracing covered the requested approval, cancellation, outcome, evidence, checker, redaction and browser-ownership paths. The current source contains the earlier protections, including document-bound queued navigation, bounded cancellation and eviction, close confirmation, sign-in waiting, origin-only history, whole-turn recap copying, digest-bound manual evidence and opaque invocation selectors. The pool enforces one owner per project/session; pop-out reserves ownership before opening and reconciles against native window inventory. I found no additional concrete P1 in those paths.

Eight in-memory assertions passed for self-unregistering completion, stale-request rejection, outcome classification and empty-catalog checker exit codes. **Vitest did not execute tests:** its temporary-directory creation was blocked by the read-only environment. No native Electron/UI journey was run; this is a source audit with targeted executable reproductions, not native qualification.

