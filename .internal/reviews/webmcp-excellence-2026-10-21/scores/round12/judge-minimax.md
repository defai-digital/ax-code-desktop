## Round 12 judgment (judge 2), HEAD `cbb21705`

Verified in source; optional runtime fields (ADR-266 masked args, correlation ids, schema profile) credited zero.

### Supervisor (A)

| Step | Baseline → HEAD | Evidence sentence |
|---|---|---|
| **A1 discover** | 6 → **7** | The pane lists every tool with its description and the builder guide link appears even when nothing is registered (`WebMcpBuilderHint.tsx:20`), but the row still shows only a truncated name and description — no raw schema, hints or truncation note (`WebMcpToolPanel.tsx:163`). |
| **A2 enable/scope trust** | 6 → **7** | Enable/disconnect/resume and a hard per-request session+project identity check exist (`desktop-webmcp-browser.js:318`), and the card now says the answer covers this call only (`PermissionCard.tsx:461`); no origin/scope/revocation surface in one place, and the64-entry catalog cap is applied with no visible note (`useWebMcpBrowserStore.ts:214`). |
| **A3 watch live** | 5 → **6** | The supervisor does see effects in the real page, and a strip lists calls with outcome and reason (`WebMcpCallStrip.tsx:31`), but there is no per-step live marker, duration, page marker or link from a row to its approval or transcript part. |
| **A4 approvals** | 6 → **8** | One sentence is built only from call data, never the page's description (`toolHelpers.ts:460`), with origin, masked arguments and the scope line; a timeout outcome exists only as a reason string, not as a visible outcome on the card. |
| **A5 failure recovery** | 5 → **7** | Completed, application error, timeout, cancellation and uncertain completion are distinct on both surfaces and share one 12-reason vocabulary (`toolHelpers.ts:258`, `WebMcpToolPanel.tsx:124`), and the pane offers a concrete Fix action (`EmbeddedWebMcpBrowser.tsx:427`); uncertain never auto-retries. |
| **A6 evidence after the task** | 6 → **8** | The landing recap lists each browser step in order, how it was done, how it ended with its reason, and the page's never-called tools (`ReviewLandingBrowserEvidence.tsx:73`); it reports calls, never verification. |
| **A7 pause and take over** | 6 → **6** | Only Disconnect and an automatic pause when the view is hidden; there is no Pause-agent action distinct from Disconnect and no acknowledgement that an in-flight call was cancelled (`EmbeddedWebMcpBrowser.tsx:383`). |
| **A8 several sessions** | 3 → **3** | One view, one `sessionID` per entry (`desktop-webmcp-browser.js:390`); a second session gets the runtime's "no project browser enrolled" and enabling it drops the first session's page and sign-in. |

**A mean 6.5** (baseline ≈5.5).

### Builder (B)

| Step | Baseline → HEAD | Evidence sentence |
|---|---|---|
| **B1 registered tools** | 3 → **4** | The catalog carries `inputSchema` and the form is built from it, but the UI still renders only name plus truncated description and silently drops malformed entries (`useWebMcpBrowserStore.ts:217`); no origin, hints or raw schema. |
| **B2 try and compare** | 3 → **8** | Try it is genuinely honest: every property, exact whitespace, absent/empty/zero/false, declared constraints, advisory warnings with Send anyway, explained JSON fallback and distinct outcomes (`WebMcpToolPanel.tsx:186`, `:114`, `:305`); there is still no journal, replay or comparison with the agent's own call. |
| **B3 iterate** | 4 → **5** | Re-registration updates the catalog and `definition-changed` is a real reason, but an invalid catalog vanishes silently, there is no diff/timeline, and form drafts live in component state and are lost on reload. |
| **B4 diagnose misuse** | 3 → **5** | Shared reasons plus `nextAction` and the page's own error text make a misuse legible (`toolHelpers.ts:429`, `WebMcpToolPanel.tsx:137`); nothing links a manual run to the agent's call or turns it into a test. |
| **B5 onboarding docs** | 2 → **8** | A real guide plus a runnable four-tool example, schema limits, test snippet and troubleshooting table (`docs/webmcp-page-tools.md:76`, `docs/examples/webmcp-quickstart/index.html:54`); it is English-only, not surfaced in-product beyond one link, and needs a manual server step. |

**B mean 6.0** (baseline ≈3.2). Moved: A4, A5, A6, B2, B5 clearly; A1, A2, A3, B1, B3, B4 slightly; A7 and A8 not at all.

### Three highest-leverage changes
1. **WX-15 bounded pool of per-session views** — the only step at 3; moves A8 by up to 6.
2. **WX-02 inspectable capabilities (Desktop part only)** — raw schema, hints, origin, visible truncation lift B1 from 4 and A1 to 9.
3. **WX-04 + WX-05 registration truth and a manual journal** — names rejected catalogs, keeps drafts across reload, and lets a manual run be replayed against the last agent call (B3, B4).

Honest caveat: `project-browser-webmcp.mjs:2` claims W1 and W2 but only runs W1 discovery, so the new manual-form path has no native journey yet.