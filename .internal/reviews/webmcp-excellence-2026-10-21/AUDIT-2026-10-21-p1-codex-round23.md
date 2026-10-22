**Three P1 findings at `dff149ee`; DoD item 3 is not satisfied.** No files were modified.

1. **P1 — Bracketed credential assignments bypass text redaction.**  
   `desktop/shared/webmcp-redaction.mjs:72`

   **Reproduction:** Have a page tool return `{error: 'auth["api.key"] = demo-value'}`, then use **Try it** or `webmcp:check --json`. The assignment scanner does not recognize the closing bracket between the sensitive name and `=`. Both `webMcpDisplayReport(manualToolResult(...))` and the checker’s serialized report projection retain `demo-value`. The actual UI result-preview helper also displays it.

   **Impact:** Credentials in a conventional property-path diagnostic reach the screen and checker report storage. Round 22 protects quoted compound names in structured `path` fields, but leaves this textual equivalent exposed.

2. **P1 — Sensitive field context is lost across nested diagnostic containers.**  
   `desktop/shared/webmcp-redaction.mjs:150` and `:160`

   **Reproduction:** Return `{error:{field:"api_key",details:{got:"demo-value"}}}`. The redactor recognizes the sensitive field at the outer error object, but checks only immediate sibling value keys. Recursion into `details` discards that context. In-memory probes confirmed that the manual IPC projection, actual UI result preview, and serialized checker-report projection all retain the value.

   **Impact:** A credential explicitly identified by the diagnostic’s field name leaks to the screen and report storage. The existing direct-sibling case, `{field:"api_key",got:"demo-value"}`, is correctly masked.

3. **P1 — Closing the owner window can strand an unsaved browser page under a dead owner.**  
   `desktop/packages/electron/src/desktop-webmcp-browser.js:978`, `:434` and `:989`; supporting window-close path: `desktop/packages/electron/src/main.js:932`

   **Reproduction:** On macOS, open a project-browser page with a vetoing `beforeunload` handler, edit it, then close the Desktop owner window without quitting the app. Browser cleanup starts from the owner’s **already-fired `closed` event**, rather than gating its `close` event. When the guest refuses closure, `close(entry)` rejects before removing ownership.

   An in-memory lifecycle reproduction produced all four results: the guest remained alive, `liveViews` remained 1, reopening the same project/session returned `owned-by-another-window`, and **Focus owner** failed with “The browser owner window is unavailable.” The rejection was also unhandled. A veto preserving the guest is consistent with [Electron’s documented close behavior](https://www.electronjs.org/docs/latest/api/web-contents/#contentscloseopts).

   **Impact:** Unsaved work becomes inaccessible, and the session’s browser cannot reopen through the available owner-recovery action. The retained page also occupies pool capacity. This lifecycle reproduction used an Electron event double; it was not a native UI journey.

**P2:** `desktop/packages/ui/src/lib/webMcpToolForm.ts:90` silently limits advisory diagnosis to 128 properties. With 129 integer properties and `{p128:"wrong-type"}`, `diagnoseWebMcpInput` returns `{status:"checked",findings:[]}` without a coverage-gap notice. The UI can therefore suggest that its supported checks passed while omitting an otherwise supported primitive-property check.

**Verification and limits:** I reviewed the requested implementation paths and documentation. Fourteen focused, in-memory assertions passed for earlier fixes, including indexed and quoted structured credential paths, pair arrays, encoded URL parameters, OAuth/signed-URL filtering, complete descriptions, separate executable schemas, stable tool IDs, timeout/cancellation export refusal, and complete-value length diagnosis. Source tracing retained the single-owner pop-out guards, request identity checks, and native initialization deadlines.

Vitest could not execute tests because its temporary-directory creation was denied by the read-only sandbox. No native Electron journey ran, so this audit does not claim full behavioral qualification of every earlier fix. The excluded configuration, lockfile, and version-pin changes were not treated as findings.

