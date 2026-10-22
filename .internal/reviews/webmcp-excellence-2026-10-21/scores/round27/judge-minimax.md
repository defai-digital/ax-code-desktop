## Bug/Review Analysis — Round 27 judgment at `1442693e`

**Method.** Read-only; bash is denied in this turn (no test run, no screenshots) so this is source judgment against an absolute bar. HEAD is `1442693e`; `92775899` is an ancestor, so everything cited is current. I ignored uncommitted `config/`, lockfile and version-pin edits. `UI` = `desktop/packages/ui/src`, `E` = `desktop/packages/electron/src`, `S` = `desktop/shared`, `D` = `docs/`. v7.28.2 sends only `definitionDigest` + redacted `inputPreview` on approval metadata; Desktop renders exactly that shape (`useWebMcpApprovalOutcome.ts:33`, `toolHelpers.ts:446`) and invents nothing beyond it.

**Round 27 verified in source.** A rejected value is collected before projection and its echo pattern is masked everywhere — sibling, ancestor and prose — and a whole-prose field collapses rather than leaking a fragment (`S/webmcp-redaction.mjs:128`, `:166`, `:170`). That is a real tightening of the same shared redactor that feeds the approval card, the collapsed failure row and the diagnosis lists. I found no place that now hides more than it should.

| Step | Score | Judgment (one sentence, path:line) |
|---|---:|---|
| A1 discover | 8 | Full description, raw schema, hint badges, named catalog rejections and a truncation note are present, but the catalog is still a technical disclosure list with no capability grouping or search (`UI/components/mcp/WebMcpToolPanel.tsx:964`). |
| A2 enable/scope trust | 9 | Origin, project, session, access state, per-page revoke and project sign-out live in one surface, effective on the next call, with no standing grant (`UI/components/mcp/WebMcpPages.tsx:128`; `UI/components/layout/EmbeddedWebMcpBrowser.tsx:488`). |
| A3 watch live | 8 | The strip shows outcome, duration, redacted arguments, digest, result, failure summary and an approval link, but arguments still truncate at 140 characters and nothing renders intermediate page state (`UI/components/mcp/WebMcpCallStrip.tsx:114`). |
| A4 approvals | 8 | The card gives a call-derived effect sentence, origin, tool, element and "this call only" scope, yet a vanished ask can only say no answer was recorded (`UI/components/chat/PermissionCard.tsx:398`; `UI/lib/i18n/messages/es.json:5404`). |
| A5 failure recovery | 8 | A failed call now names its redacted reason and first finding on the collapsed row and the strip, and native init failure names the stage, but there is still no single retry-and-resume path for an uncertain completion (`UI/lib/webMcpFailureSummary.ts:13`; `E/native-webmcp.js:153`). |
| A6 evidence after task | 8 | The recap carries step, kind, outcome, duration, digest, changed-definition marks, runtime rejections and never-called tools and copies the whole turn, but it carries no call inputs (`UI/components/views/git/ReviewLandingBrowserEvidence.tsx:89`). |
| A7 pause and take over | 8 | Pause is separate from Disconnect, keeps the page, and reports stopped vs still-finishing without claiming rollback (`UI/components/layout/EmbeddedWebMcpBrowser.tsx:381`; `E/native-webmcp.js:20`). |
| A8 several sessions | 8 | Per-session pages, bounded pool, independent revoke, waiting chips on Mission Control rows and grid panes reaching their session's page all work (`UI/components/mcp/WebMcpPages.tsx:80`; `:203`). |
| B1 see registered tools | 8 | Schemas, hints, advisory lint, truncation and named rejections are inspectable, but field aids still cut descriptions at 300 characters with no notice (`UI/lib/webMcpToolForm.ts:30`). |
| B2 try and compare | 8 | Full forms, masked JSON drafts, replay, side-by-side manual/agent compare and test export exist, and an off-list enum value is now shown explicitly and gated behind a confirm before sending (`UI/components/mcp/WebMcpToolPanel.tsx:361`; `:874`). |
| B3 iterate | 8 | Registration timeline, retained drafts across reload, stale marks and property diffs support iteration, but the diff is still one raw JSON block (`UI/components/mcp/WebMcpToolPanel.tsx:1017`). |
| B4 diagnose misuse | 8 | Digest-bound advisory findings plus runtime rejections naming property and rule are honest and never invented, but a missing receipt reduces to "no input available" (`UI/lib/webMcpDiagnosis.ts:227`; `UI/components/mcp/WebMcpToolPanel.tsx:328`). |
| B5 onboarding docs | 8 | The guide is runnable end to end and linked in-app, and now documents receipts, off-list replay and rejection vocabulary, yet onboarding remains a document, not an in-product loop (`D/webmcp-page-tools.md:12`; `:305`). |

**Means:** A **65/8 = 8.125 → 8.13**. B **40/5 = 8.00**.

**Movement versus round 26 (all ≥8):** no step moved. Round 27 is a correctness change — one more class of leak closed — in surfaces that were already above the bar; it adds no visible capability and removes no remaining gap, so the ceilings hold. My scores sit exactly at the pass floor rather than above it; two of three ballots above 8 keeps every step passing, but nothing here is near 9 except A2.

**Three changes that would raise the lowest steps most:**
1. Show inputs in the end-of-task recap and in the strip's expansion, joined from the same approval receipt (**A6, A3, B2**) — the recap is the weakest evidence surface precisely where it matters least.
2. Authoritative terminal approval states (expired / denied / cancelled, with time) delivered by the runtime, replacing "no answer was recorded" and the missing-receipt gap (**A4, B4, A6**).
3. Render the property diff as before/after rows, drop the silent 300-character description cap, and add capability grouping or filter to the catalog (**B3, B1, A1**).