## Baseline judgment at HEAD (7696232a, read-only)

**Supervisor journey (A)**

| Step | Score | Evidence and reason |
|---|---|---|
| A1 discover | 6 | The tool panel lists names, descriptions and a generated form only after the browser is enabled and a page registers tools, and returns nothing otherwise (`WebMcpToolPanel.tsx:196`); descriptions are truncated (`:120`), no raw schema, no consequence/"reads vs acts" signal. |
| A2 enable and scope trust | 6 | Enable/disconnect is explicit and per browser (`EmbeddedWebMcpBrowser.tsx:397`, `:388`), but there is no consolidated scope summary, sign-in popups are denied (`desktop-webmcp-browser.js:375`) and closing wipes storage (`:143`). |
| A3 watch live | 5 | The strip renders title, truncated arguments and an outcome from transcript parts (`WebMcpCallStrip.tsx:49`); no duration (though `at` is collected in `webMcpCalls.ts:80` and never shown), no expandable result, no page binding, no approval link. |
| A4 approvals | 7 | The card shows origin, tool, operation, element, submit flag and redacted text/arguments (`PermissionCard.tsx:374`); no effect sentence derived from call data, no statement of which authority covers the call, no visible timeout/expiry outcome. |
| A5 failure recovery | 5 | Navigation errors are mapped to plain-language messages with a repair action (`webMcpSummary.ts:22`), but a failed manual call collapses to one generic string (`WebMcpToolPanel.tsx:98`) and any page error becomes `reason:"invoke-failed"` (`desktop-webmcp-browser.js:629`); no uncertain-completion workflow. |
| A6 evidence after task | 6 | Landing shows call/failure counts and a hint only (`ReviewLandingBrowserEvidence.tsx:21`); no recap joining page, arguments, result and approval, no drilldown. |
| A7 pause and take over | 6 | Resume keeps the page (`EmbeddedWebMcpBrowser.tsx:375`) and hiding the view auto-pauses (`desktop-webmcp-browser.js:432`), but there is no user "Pause agent" control and no cancellation-acknowledged feedback. |
| A8 several sessions | 3 | One `WebContentsView` per window, replaced on reconfigure (`desktop-webmcp-browser.js:350`), and a session change recreates the browser with storage cleared, so no concurrent pages or ownership overview. |

**Mean A = 5.5**

**Builder journey (B)**

| Step | Score | Evidence and reason |
|---|---|---|
| B1 see registered tools | 3 | Only name, description and derived inputs are surfaced (`WebMcpToolPanel.tsx:118`); `inputSchema` is stored but never rendered (`useWebMcpBrowserStore.ts:218`) and an invalid catalog silently kills the adapter (`native-webmcp.js:148`, `:156`). |
| B2 try and compare | 4 | Manual "Try it" exists with no grant (`EmbeddedWebMcpBrowser.tsx:436`), but the form drops properties past 24 and trims values (`webMcpToolForm.ts:19`, `:40`), ignores constraints and absent/empty/zero/false, and there is no manual history or comparison to the agent call. |
| B3 iterate | 4 | Add/remove events update a name-keyed map (`native-webmcp.js:150`) and reload works, but there is no registration timeline, schema diff, stale marking or draft retention. |
| B4 diagnose misuse | 3 | `describeWebMcpCall` (`toolHelpers.ts:348`) explains a supplied call, but nothing compares arguments to the invoked schema, and the revision that produced a failure is not identified. |
| B5 onboarding docs | 2 | `docs/` contains only `development-webmcp.md`, which opens by saying it is "separate from using website tools" (`docs/development-webmcp.md:3`); no page-authoring quickstart exists. |

**Mean B = 3.2**

**Three changes with the highest leverage on the lowest steps**

1. **Registration inspector** — render raw schema, advisory lint for runtime-rejected keywords, name rejected catalogs instead of disconnecting, and keep a registration timeline with schema diff (B1 3→8; B3 and B4 +2 each). This fixes three low steps with one surface.
2. **Author quickstart linked from the panel** — a runnable `registerTool` example from registration to agent testing, plus a troubleshooting checklist (B5 2→8).
3. **One honest failure and call vocabulary** — transport success vs application error vs timeout vs cancellation vs unconfirmed, shared by the manual panel, the strip and the transcript, with result preview, duration and a bounded manual journal (B2 4→7, B4 3→6, A5 5→7).

A8 is the joint-lowest step but is runtime-bound (WX-15); no Desktop-only change lifts it above 4, so the three above are the real baseline levers.