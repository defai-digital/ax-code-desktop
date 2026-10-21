I'll judge round 19 from source only: the controlling PRD, the round-18 ballots, and the WebMCP paths at the pinned tree.Round 18 left A5 and B4 short of a reliable receipt. I'll check the commits since `7811c298` and whether those receipts are actually in source.The pinned runtime still sends `definitionDigest` and `inputPreview` only on the approval ask. I'll check whether Desktop now keys evidence on its own tool id without inventing those fields.**Round 19 at `f06cea02`.** Judged `desktop/packages/ui/src`, `desktop/packages/electron/src`, and `docs/`. v7.28.2 puts `definitionDigest` and a redacted `inputPreview` on the approval ask only (`../ax-code` `packages/ax-code/src/tool/desktop_webmcp.ts:216-228`). The completed part keeps `truncated`, `providerID`, `generation`, and `operation` (`desktop_webmcp.ts:251-256`). Uncommitted runtime pins are ignored.

| Step | Score | Judgment |
|---|---:|---|
| A1 discover | 8 | Hint badges, origin, a truncation note, and a schema redacted from the original tree are in a collapsed catalog, and credential-shaped names get distinct labels (`desktop/shared/webmcp-catalog-projection.cjs:57`). |
| A2 enable and scope trust | 9 | Sign-out clears that project's isolated partition after the unsaved-work check, and saved history stays origin-only (`desktop/packages/ui/src/components/layout/EmbeddedWebMcpBrowser.tsx:482`). |
| A3 watch live | 8 | A running row opens its transcript part and, while pending, the approval; the strip prints an unanswered ask (`desktop/packages/ui/src/components/mcp/WebMcpCallStrip.tsx:63`). |
| A4 approvals | 8 | A matching `definitionDigest` selects one main-issued label, the redacted `inputPreview` keeps the runtime truncation marker, and the page description expands in full (`desktop/packages/ui/src/components/chat/PermissionCard.tsx:212`). |
| A5 failure recovery | 7 | The collapsed transcript says the call failed unless the part status is timeout or cancelled, and the completed part carries no allowlisted reason (`desktop/packages/ui/src/components/chat/message/parts/ToolPart-impl.tsx:1676`). |
| A6 evidence after the task | 8 | The landing recap copies the whole turn, and an invoke with no main-issued id is marked unknown so a never-called list is withheld (`desktop/packages/ui/src/components/views/git/ReviewLandingBrowserEvidence.tsx:98`). |
| A7 pause and take over | 8 | Pause waits up to 500 ms for cancellation and reports stopped or still finishing, leaving the page with the person (`desktop/packages/electron/src/native-webmcp.js:11`). |
| A8 several sessions | 8 | Each session keeps its own page, hidden calls wait, and eviction probes a page that may hold unsaved work (`desktop/packages/electron/src/browser-eviction.js:24`). |
| B1 see registered tools | 8 | Kind, hints, origin, the display schema, and a named rejection are visible before any grant (`desktop/packages/ui/src/components/mcp/WebMcpToolPanel.tsx:506`). |
| B2 try and compare | 8 | Try, replay, and export bind to the main-issued id plus the native digest, while a completed v7.28.2 call has no `inputPreview` to compare (`desktop/packages/electron/src/desktop-webmcp-browser.js:1352`). |
| B3 iterate | 8 | History keeps 32 events, and the property diff includes numeric, length, pattern, format, and default changes as one JSON blob (`desktop/packages/ui/src/lib/webMcpPropertyDiff.ts:17`). |
| B4 diagnose misuse | 7 | A real v7.28.2 completion reports arguments unavailable, and a digest that is not retained falls back to the current schema (`desktop/packages/ui/src/components/mcp/WebMcpToolPanel.tsx:315`). |
| B5 onboarding docs | 8 | The guide documents approval receipts and the opaque try selector, and its troubleshooting row says the recap lists tools the agent never called (`docs/webmcp-page-tools.md:235`). |

**Means:** A **8.00** (64/8). B **7.80** (39/5).

**Versus round 18** (this ballot): no step moved. Identity matching (`desktop/packages/ui/src/lib/webMcpCatalog.ts:103`), distinct labels, original-schema sensitivity (`desktop/shared/webmcp-redaction.mjs:168`), unknown associations, and one card predicate (`desktop/packages/ui/src/lib/permissions/permissionPayload.ts:7`) are in source and stay inside these scores. A header-entry array still keeps its value (`desktop/shared/webmcp-redaction.mjs:115`), so the result surfaces stay at 8.

**Three changes that lift the lowest steps most:**

1. Copy the approval's `definitionDigest` and `inputPreview` onto the completed tool-part metadata. Desktop already resolves one main-issued id from that digest (`desktop/packages/ui/src/lib/webMcpCalls.ts:127`). That lifts B4, the compare half of B2, and A6.
2. Show the allowlisted failure reason on the collapsed transcript row, the strip, and the recap. That needs the runtime to send the reason. That lifts A5.
3. Diagnose only the digest-named schema, using the original input. The check currently runs on the 4000-character display projection (`desktop/packages/ui/src/components/mcp/WebMcpToolPanel.tsx:280`). That lifts the remaining B4 miss.
