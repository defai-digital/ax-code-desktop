## Round 14 judgment — deepseek-flash, source at HEAD (read-only)

| Step | Score | Judgment and anchor |
|---|---|---|
| A1 discover | **8** | Catalog shows raw schema, hint badges, origin, truncation and advisory lint, but discovery is still confined to a side panel rather than a pre-grant summary; `WebMcpToolPanel.tsx:886-901`, `:1013-1019`. |
| A2 enable and scope trust | **8** | Enable/Pause/Disconnect plus a page switcher with per-session revoke give one visible scope that takes effect on the next call, and interruption is now named; still no saved-grant or sign-out story; `WebMcpPages.tsx:11-147`, `:149-166`, `useWebMcpPages.ts:10-11`, `EmbeddedWebMcpBrowser.tsx:488-499`, `:530-531`. |
| A3 watch live | **8** | Rows carry outcome, duration, result preview, earlier-page marker, failure reason and transcript jump, but still no approval link; `WebMcpCallStrip.tsx:78-107`. |
| A4 approvals | **8** | Call-data effect sentence, origin, tool and call-only scope are clear; a WebMCP approval-timeout outcome is still not rendered; `PermissionCard.tsx:386-461`. |
| A5 failure recovery | **8** | Application errors, one named browser fix and now "runtime stopped answering, reconnecting automatically" recovery exist; the panel still cannot explain a runtime-side rejection; `EmbeddedWebMcpBrowser.tsx:317-321`, `:531`, `desktop-webmcp-browser.js:543-586`. |
| A6 evidence after the task | **8** | The landing recap orders calls, how each was done, outcome and never-called tools, but carries no arguments, results or approvals; `ReviewLandingBrowserEvidence.tsx:19-59`, `:89-98`. |
| A7 pause and take over | **8** | Pause agent stays separate from Disconnect, the page is kept and nothing claims rollback; W5 is still an idle takeover, not a long call; `EmbeddedWebMcpBrowser.tsx:488-499`, `docs/webmcp-page-tools.md:98-103`. |
| A8 several sessions | **9** | The switcher names project, session, origin and access, revokes per session, names a full pool with LRU unload and cross-window recovery, and surfaces waiting pages in Needs you, Mission Control and the grid; W7 proves independent revoke and bounded heaps; `WebMcpPages.tsx:94-144`, `:190-206`, `desktop-webmcp-browser.js:696-700`, `:960-1019`, `project-browser-sessions.mjs:136-144`, `:179-185`. |
| B1 see registered tools | **8** | Registration truth, raw schema, badges, visible truncation and named rejections are present, though nothing previews a runtime rejection before a call; `WebMcpToolPanel.tsx:886-901`, `:599-618`. |
| B2 try and compare | **9** | A bounded in-memory journal with replay into an editable form, side-by-side comparison against the agent's latest call, digest difference and regression export now cover the builder loop; `WebMcpToolPanel.tsx:960-1005`, `:268-353`, `:137-165`. |
| B3 iterate | **8** | Registration timeline, named rejection, stale marking and drafts kept across reload are solid; no automatic re-registration check; `WebMcpToolPanel.tsx:886-901`, `useWebMcpBrowserStore.ts:499-502`. |
| B4 diagnose misuse | **8** | The schema check names the property, rule and value kind for both the manual run and the agent's call, marks a changed definition and exports a test; the check is advisory, not the runtime's validation; `WebMcpToolPanel.tsx:170-241`, `:300-333`, `:346-353`. |
| B5 onboarding docs | **9** | The guide now documents the journal, replay, export, pooled Pages, LRU unload, Pause agent and waiting behaviour with real string references; `docs/webmcp-page-tools.md:61-62`, `:79-80`, `:98-119`. |

**Means:** supervisor **A = 8.1** (65/8); builder **B = 8.4** (42/5). On my card all thirteen steps reach 8, so A2, A8, B2 and B4 now depend on one of the other two judges agreeing.

**Moved vs round 13 (my card):** A8 6→9, B2 7→9, B5 8→9, A2 7→8, B4 6→8. Unmoved: A1, A3, A4, A5, A6, A7, B1, B3 (all 8).

**Three changes that raise the lowest steps most**
1. **Approval expiry made visible, plus an approval link in the call strip.** Render an explicit "no answer in time / expired" outcome on the WebMCP card and link the strip row to the approval; lifts A4, A3 and A6 and closes W4's second ask (`PermissionCard.tsx:386-461`, `WebMcpCallStrip.tsx:78-107`).
2. **Sign-out and grant visibility.** Add an explicit isolated-profile sign-out and a read-only list of the grants in force (origin, tool, schema hash, re-ask on change) so A2 stops depending on prose; desktop-side only, no new grant (`WebMcpPages.tsx:149-166`).
3. **Long-call pause and runtime-reason parity.** Record W5 during an in-flight call with a cancelled-call acknowledgement in the wait state, and map runtime rejection reasons into the schema check so the panel's advisory and the runtime's allowlist agree; lifts A7 and B4 (`EmbeddedWebMcpBrowser.tsx:530-545`, `WebMcpToolPanel.tsx:170-241`).

Caveat: W7 evidence is macOS arm64 and the CI journey step is still `continue-on-error: true` (`desktop-ci.yml:305-307`); Windows/Ubuntu execution of W7 remains unproven from source. ADR-266 optional fields received no credit.