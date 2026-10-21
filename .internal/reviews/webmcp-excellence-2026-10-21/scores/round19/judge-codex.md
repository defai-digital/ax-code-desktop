**Round 19 at `f06cea02`: A 8.00/10; B 7.40/10.** Reviewed the `92775899` source lineage through HEAD and `7811c298..HEAD`. Read-only source review and in-memory probes; no files modified or native journeys executed. Version-pin changes excluded.

`UI` = `desktop/packages/ui/src`; `E` = `desktop/packages/electron/src`.

| Step | Score | Judgment and source |
|---|---:|---|
| A1 discover | **8** | Descriptions, schemas, hints, origin and catalog-limit notices support discovery, but the collapsed technical inventory still requires substantial inspection (`UI/components/mcp/WebMcpToolPanel.tsx:1000`). |
| A2 enable and scope trust | **9** | Project/session ownership, origin and scope are explicit, with separate access controls and project sign-out (`UI/components/mcp/WebMcpPages.tsx:157`; `UI/components/layout/EmbeddedWebMcpBrowser.tsx:482`). |
| A3 watch live | **8** | Outcome rows provide duration, result previews, earlier-page markers and transcript/approval navigation, although invocation arguments remain conditional on unavailable completed-call metadata (`UI/components/mcp/WebMcpCallStrip.tsx:60`). |
| A4 approvals | **8** | The card renders the supplied preview, digest-matched definition and effect statement, while disappearance records unanswered rather than proving timeout (`UI/components/chat/PermissionCard.tsx:398`; `UI/components/mcp/WebMcpCallStrip.tsx:63`). |
| A5 failure recovery | **8** | Allowlisted reasons and recovery instructions reach the transcript, but they do not provide an integrated property-level runtime diagnosis (`UI/components/chat/message/parts/ToolPart-impl.tsx:224`). |
| A6 evidence after the task | **7** | Whole-turn copying and unknown-association reporting are useful, but header-entry arrays can expose credential values in result previews carried into the recap (`UI/lib/toolHelpers.ts:346`; `UI/components/views/git/ReviewLandingBrowserEvidence.tsx:122`). |
| A7 pause and take over | **8** | Separate pause/disconnect controls and bounded cancellation acknowledgement preserve the page while honestly reporting unfinished execution (`UI/components/layout/EmbeddedWebMcpBrowser.tsx:545`; `E/native-webmcp.js:509`). |
| A8 several sessions at once | **8** | Bounded session-owned views and actionable waiting-page summaries support concurrent supervision, with hidden-page execution still requiring attention (`E/desktop-webmcp-browser.js:73`; `UI/components/mcp/WebMcpPages.tsx:198`). |
| B1 see registered tools | **8** | Schema inspection, hints, advisory lint and named registration rejection are substantial, without authoritative runtime-validator parity (`UI/components/mcp/WebMcpToolPanel.tsx:479`; `:1018`). |
| B2 try by hand and compare | **7** | Manual evidence and replay now match exact native identities, but real completed agent calls still lack the metadata required for dependable comparison (`UI/lib/webMcpCatalog.ts:103`; `UI/lib/webMcpCalls.ts:127`). |
| B3 iterate | **7** | Registration history and expanded constraint diffs help iteration, but accepted long or `__proto__` property names silently lose drafts when the panel remounts (`UI/lib/webMcpPropertyDiff.ts:15`; `UI/stores/useWebMcpBrowserStore.ts:501`). |
| B4 diagnose misuse | **7** | Identity matching prevents misleading associations, but diagnosis truncates values before validation and can fall back to the current schema when historical evidence is unavailable (`UI/components/mcp/WebMcpToolPanel.tsx:280`; `:315`). |
| B5 onboarding docs | **8** | The runnable quickstart covers the builder loop, but comparison guidance overstates what approval-only previews make available afterward (`docs/webmcp-page-tools.md:12`; `:303`). |

**Means:** A **64/8 = 8.00**; B **37/5 = 7.40**.

Compared with the **round 18 Codex ballot**, **A6 falls 8→7 and B3 falls 8→7** because directly reproduced gaps warrant stricter assessment; all other scores hold. Round 19’s identity, distinct-label, original-schema sensitivity and unknown-association fixes earn credit without overcoming those limitations.

The v7.28.2 tag supplies preview/digest to approval metadata at `packages/ax-code/src/tool/desktop_webmcp.ts:217`, but omits both from successful return metadata at `:254`; I give no post-call credit for those absent fields.

Three highest-impact changes:

1. Retain redacted invocation receipts in completed-call metadata and diagnose complete values against the exact invoked definition (**B2/B4**).
2. Preserve every accepted draft key using prototype-safe storage and explicit capacity handling (**B3**).
3. Redact credential header pairs consistently before previews, copying and export (**A6**).

Nine steps reach 8 on this ballot; consensus requires another judge’s score. The reproduced credential and draft-loss findings also prevent endorsing the fresh-audit gate.

