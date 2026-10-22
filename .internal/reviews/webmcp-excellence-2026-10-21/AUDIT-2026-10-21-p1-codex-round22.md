**Two P1 findings at `563605c1`. PRD definition-of-done item 3 is not met.** No files were modified.

1. **P1 — Compound credential names lose sensitivity inside diagnostic paths.**  
   `desktop/shared/webmcp-redaction.mjs:94–99`

   Path-valued fields skip the whole-name sensitivity check, then split dotted/bracketed paths without preserving quoted property names. Thus `api.key` is recognized as sensitive in ordinary fields but becomes separate, nonsensitive `api` and `key` segments in a path.

   **Reproduction:** Have a page tool return:
   ```json
   {"error":{"path":"auth[\"api.key\"]","constraint":"minLength: 20","got":"short-canary"}}
   ```
   Both `redactWebMcpReport()` and `webMcpDisplayReport()` preserve `"got":"short-canary"`. This was reproduced directly against current source, including JSON-string output and repeated checker redaction.

   **User impact:** A rejected API key can reach the manual result display through `desktop/packages/electron/src/desktop-webmcp-browser.js:1377`. The checker also retains it in its disk report through `desktop/packages/electron/scripts/webmcp-check-entry.cjs:36`, and prints it with `--json` through `desktop/packages/electron/scripts/webmcp-check.mjs:77`. This is a remaining gap in the round-22 path-sensitivity fix. `private.key` has the same problem.

2. **P1 — Native browser initialization can permanently block browser creation and shutdown.**  
   `desktop/packages/electron/src/native-webmcp.js:120–123`; `desktop/packages/electron/src/desktop-webmcp-browser.js:1008`

   `Page.enable`, `Page.getFrameTree`, and `WebMCP.enable` are awaited without deadlines or lifecycle cancellation. Initialization occupies the globally serialized pool queue. The page is not marked ready until initialization finishes, so the usable page inventory excludes it.

   **Reproduction:** In a transport fault-injection harness, leave `debugger.sendCommand("Page.enable")` unresolved. Request one page, request another page, then call `closeAll()`. All three promises remain pending. The first page is absent from `list().views`; even after its contents are destroyed, initialization remains pending.

   **User impact:** A stalled native initialization leaves the pane without a usable browser ID, blocks subsequent page creation, and blocks shutdown at `desktop/packages/electron/src/desktop-webmcp-browser.js:1471`, which awaits the same pool queue. Force termination becomes necessary. The existing page-load deadline does not cover this stage. This finding was reproduced with an injected stalled transport, not a native renderer-hang journey.

**P2**

- `desktop/packages/ui/src/lib/webMcpToolForm.ts:30`: Property descriptions are silently shortened to 300 characters without an expansion control or truncation notice. Register a primitive property with a longer description: the generated field omits the remainder. The schema block provides a workaround.

The earlier controls are substantially present in source: document/session/provider binding, cancellation after visibility waits, rejected-definition retirement, opaque tool identities, approval receipts, origin-only durable history, close confirmations, bounded eviction probes, checker receipts and timeout contamination, and pop-out ownership guards. No additional P1 was established in those paths.

Validation: all **13 shared redaction tests passed**. Direct source probes also passed top-frame filtering, rejected replacements, self-unregistration/stale invocation rejection, and terminal outcome classification. Broader Vitest execution was blocked by temporary-directory writes prohibited by the read-only environment; native UI journeys were not run.

