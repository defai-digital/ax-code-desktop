Verification is complete across all 13 steps. Here is my ballot.

## Round 15 judgment at `92775899` (judge: codex-style independent ballot, read-only)

ADR-266 optional runtime fields (`inputPreview`, `arguments`, `definitionDigest`, correlation ids) are **not** in the pinned runtime and receive **no credit**.

| Step | Score | Judgment + path:line |
|---|---:|---|
| A1 discover | **8** | Descriptions, raw schema, hint badges, origin, truncation, named rejection and advisory lint are all readable pre-grant, but nothing summarises capabilities before access (`WebMcpToolPanel.tsx:906`, `:927`, `:436`). |
| A2 enable/scope trust | **8** | One display-only trust surface with per-session revoke effective next call (`WebMcpPages.tsx:123`), but `clearProject` has **no UI caller** — no explicit sign-out, and no origin+tool+schema-bound saved grant (`desktopIpcContract.gen.ts:87`). |
| A3 watch live | **8** | Outcome, duration, result preview, failure reason, earlier-page marker, transcript jump **with highlight** and a running-call approval link (`WebMcpCallStrip.tsx:63`, `:121`; `revealToolPart.ts:15`). Unmoved from R14's deepseek 8; codex's 7 objection is now closed. |
| A4 approvals | **8** | Call-derived effect, call-only scope and the page's own definition with hints, `required` markers, description and "hints never approve" (`PermissionCard.tsx:396`, `:470`; `WebMcpApprovalToolInfo.tsx:65`, `:74`). Approval-*expiry* outcome still unrendered. |
| A5 failure recovery | **8** | Distinct outcomes with one shared vocabulary (`webmcp-manual-outcome.js:16`, `:40`) plus reconnect/interrupted surfacing; still no runtime-side rejection explanation (`desktop-webmcp-browser.js:553`). |
| A6 evidence | **8** | Recap steps are buttons with duration, result, definition identity, a changed-definition flag, "Showing the latest" cap and clipboard copy (`ReviewLandingBrowserEvidence.tsx:143`, `:173`, `:191`, `:194`). |
| A7 pause/take over | **9** | Pause awaits the bounded native ack and reports `stopped` vs `still-finishing` (`native-webmcp.js:9-18`; `desktop-webmcp-browser.js:313-318`), interrupting only the original document (`native-webmcp.js:428`, `:486`), with a working owner-window focus (`desktop-webmcp-browser.js:995`). |
| A8 several sessions | **8** | Named ownership, per-session revoke and cross-window focus are solid (`WebMcpPages.tsx:90`), but LRU eviction is still same-window only and dead-ends on `pool-full` (`desktop-webmcp-browser.js:718-720`). |
| B1 see tools | **8** | Registration timeline, named rejections, raw schema, truncation (`WebMcpToolPanel.tsx:907`, `:934`); no preview of a runtime rejection before a call. |
| B2 try and compare | **8** | Journal, replay, side-by-side compare and regression export with secret redaction and password inputs (`WebMcpToolPanel.tsx:119`, `:400`); agent half needs runtime arguments (`WebMcpToolPanel.tsx:327`). |
| B3 iterate | **8** | Timeline, drafts across reload, stale marks (`WebMcpToolPanel.tsx:57`, `:948`); still digest-only, **no inspectable property-level diff** (`webMcpDiagnosis.ts:96`). |
| B4 diagnose misuse | **8** | Names property/rule/value-kind with changed-definition flags (`WebMcpToolPanel.tsx:183`, `:234`); advisory, and agent diagnosis is inert without runtime arguments (`WebMcpToolPanel.tsx:330`). |
| B5 onboarding | **8** | Guide linked from the panel (`WebMcpBuilderHint.tsx:7`); unchanged this round. |

**Means: A = 8.00, B = 8.00** (codex R14: A 7.38, B 7.40).

**Moved vs round 14 (codex card):** A3 7→8, A4 7→8, A6 7→8, A7 7→9. Unmoved: A1, A2, A5, A8, B1–B5. R15a and R15d are **verified in source**; R15b/R15c workspace work (grid drag/dock/split/pop-out, PR facets, palette search) exists but touches no WebMCP journey step, so it earns no rubric credit.

**Three changes that raise the lowest steps most:**
1. **Inspectable property-level schema diff** — keep the prior definition's properties and diff added/removed/changed fields instead of digest equality alone (lifts **B3** to 9, **B4** to 9 by diagnosing against the invoked definition).
2. **Explicit sign-out plus a read-only grant list** — wire the existing `clearProject` action to a control and show grants bound to origin+tool+schema hash with re-ask on change (**A2** → 9, safety edge of **A4**).
3. **Approval-expiry outcome plus runtime receipts** — render an explicit "expired / no answer" state on the WebMCP card and map runtime rejection reasons into the shared vocabulary (**A4** → 9, **A5** → 9, and unblocks the agent half of **B2/B4**).

Steps reaching 8 on this ballot: all thirteen. Passage requires two of three judges; this ballot alone establishes no consensus.