**Round 12 judgment at HEAD — source only (no files modified)**

| Step | Score | One-sentence judgment and anchor |
|---|---|---|
| A1 discover | 6 | Names, hover descriptions, generated fields and constraints appear, but still no raw schema, origin, hint badges or catalog-truncation note; `WebMcpToolPanel.tsx:162-198`, `:355-360`. |
| A2 enable and scope trust | 6 | Enable, Disconnect and Resume are explicit and the guide explains the boundary, but there is no single trust surface with origin/scope/session/revocation; `EmbeddedWebMcpBrowser.tsx:383-400`, `docs/webmcp-page-tools.md:52`. |
| A3 watch live | 5 | The strip lists recent calls with arguments and outcome, but no duration, result preview, page marker, approval link or transcript jump; `WebMcpCallStrip.tsx:49-87`. |
| A4 approvals | 8 | The card opens with a call-data-only effect sentence and says the answer covers this call only; masked arguments remain unavailable and the ask itself has no visible deadline; `PermissionCard.tsx:383-388`, `:460-461`, `toolHelpers.ts:456-468`. |
| A5 failure recovery | 7 | Manual and transcript now share distinct application-error, timeout, cancelled and uncertain reasons with no auto-retry, but recovery is still one hint plus docs; `WebMcpToolPanel.tsx:122-143`, `toolHelpers.ts:503-530`. |
| A6 evidence after task | 7 | Landing recaps each step, how it was done, its outcome and failure reason, plus never-called tools; it carries no arguments/results/approvals and has no per-call drilldown; `ReviewLandingBrowserEvidence.tsx:73-103`. |
| A7 pause and take over | 6 | Hiding the view pauses access and Resume keeps the page, but there is no user Pause agent control or cancellation acknowledgement; `EmbeddedWebMcpBrowser.tsx:375-378`. |
| A8 several sessions | 3 | A project or session change still tears down and recreates the one native view with a fresh snapshot; `EmbeddedWebMcpBrowser.tsx:127-164`. |
| B1 see registered tools | 4 | Tools expose name, description, derived fields and constraints, but not raw schema, hint badges, origin, truncation or rejected catalogs; `WebMcpToolPanel.tsx:162-198`. |
| B2 try and compare | 6 | Try it now sends exact strings, distinguishes absent/empty/zero/false, shows constraints and honest outcomes, but keeps no journal, replay or comparison with the agent’s call; `webMcpToolForm.ts:60-83`, `WebMcpToolPanel.tsx:84-147`. |
| B3 iterate | 4 | Reload exists and the catalog updates in place, but there is no registration timeline, schema diff, stale marking or proven draft retention; `EmbeddedWebMcpBrowser.tsx:355-364`. |
| B4 diagnose misuse | 5 | The shared reason vocabulary names application errors, timeouts and cancellations, but nothing compares the agent’s arguments to the schema or identifies the revision used; `toolHelpers.ts:258-271`, `:503-530`. |
| B5 onboarding docs | 8 | The quickstart is real, runnable, linked from the pane and includes exact labels, the error contract and troubleshooting; it still omits the runtime-version requirement, one-pane limit and platform notes; `docs/webmcp-page-tools.md:1-112`, `WebMcpBuilderHint.tsx:5-31`. |

**Means:** A = 6.0 (48/8), B = 5.4 (27/5). Baseline was about A 5.5 / B 3.2.

**Moved versus baseline:** A4 (6/7/7→8), A5 (5/5/6→7), A6 (6→7), B2 (3/4/4→6), B4 (3/3/4→5), B5 (2→8). Unchanged: A1, A2, A3, A7, A8, B1, B3. WX-11’s roving tab focus and named page region are genuinely present (`EmbeddedWebMcpBrowser.tsx:501-516`, `:448-453`) but lift no rubric step by themselves. The review rail tree is a review-navigation feature, not a WebMCP step, so I give it no credit here.

**Three changes that raise the lowest steps most**
1. **WX-15 session browser pool** — per-project/session views with visible ownership and independent revocation; this is the only credible way to move A8 from 3 toward 9.
2. **WX-02 capability inspector** — full description, raw schema, hint badges, origin, truncation and rejected-catalog visibility; lifts B1 from 4 toward 8 and helps B3/B4.
3. **WX-04 registration truth** — named rejections, registration timeline with schema diff, stale results and draft retention; lifts B3 from 4 toward 8 and B4 with it.

**Evidence caveat:** the W1 script is real (`desktop/packages/electron/scripts/e2e/project-browser-webmcp.mjs:32-80`) but has no package-script or workflow reference, and `desktop-ci.yml:165-221` runs journeys only on macOS; the “joins the three-platform CI journey job” claim is not supported at HEAD. I also gave no credit for ADR-266 optional fields, since the pinned runtime does not send them.