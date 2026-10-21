## Verified source anchors (read this turn)

`WebMcpToolPanel.tsx:118-122` (name/description `truncate`, no schema, no annotations) · `useWebMcpBrowserStore.ts:216-219` (catalog keeps only name/description/inputSchema — drops the `annotations` that `native-webmcp.js:138` actually ships) · `webMcpToolForm.ts:19` (`.slice(0,24)`), `:40` (`raw.trim()`), no pattern/min/max · `WebMcpToolPanel.tsx:94-100,168-176` (reason collapsed to `webmcp.tools.failed`; `reply.ok` drives success styling) · `EmbeddedWebMcpBrowser.tsx:374-400` (one overloaded action slot: Resume | Fix-address | Disconnect | Start-session | Enable), `:403-417` (three stacked hint paragraphs), `:489-498` (arrow keys flip `agentBrowser` without moving focus), `:214-227` (1 s full-status poll) · `desktop-webmcp-browser.js:350` (one view per window), `:138-152` (storage wiped on close), `:375` (popups denied) · `ReviewLandingBrowserEvidence.tsx:21-29` (counts only) · `webMcpCalls.ts:53-84` (session-wide, limit 20, no page/duration) · `PermissionCard.tsx:199-203` (Desktop project-browser calls never get a saved scope) vs `WebMcpAllowlistSection.tsx` (bridge grants, per server).

## Proposals

**P1 · MULTIPLY · A1 7→9, B1 3→8 · Desktop-only · M**
Split the tool panel into three explicit bands — *Page offers* / *Agent may call* / *You tried* — and keep the raw schema behind a disclosure instead of a derived form. `WebMcpToolPanel.tsx:108-183` (add `WebMcpToolDetail.tsx`), `:211`; carry `annotations` + `frameId` through `readWebMcpCatalog` (`useWebMcpBrowserStore.ts:211-221`). Acceptance: unit — panel renders a hint badge (`readOnlyHint` / `untrustedContentHint`) and a raw-JSON disclosure for a 40-property schema; journey — 40-property tool shows all fields.

**P2 · MINUS · B2 4→8, B3 4→7 · Desktop-only · S**
Stop truncating silently. `webMcpToolForm.ts:19` (drop `.slice(0,24)`, paginate instead), `:40` (stop trimming strings; trim only for numbers/booleans), `WebMcpToolPanel.tsx:168-176` (render schema-constraint errors under the field, not in the result block). Acceptance: unit — a 30-property schema yields 30 fields; `"  lead  "` round-trips untrimmed; `minLength` violation renders inline.

**P3 · PLUS · B2 4→9, B4 3→7 · Desktop-only · M**
Give the manual Run form a retained, agent-compareable history: every manual call records `{tool, input, status, duration, schemaDigest}` and the strip/catalog offers "replay with editable input" and "diff vs last agent call". `WebMcpToolPanel.tsx:59-106` (lift per-tool state to a store), new `stores/useWebMcpProbeStore.ts`. Acceptance: unit — two runs of one tool produce two history rows; replay pre-fills prior input; a definition-digest change marks the row stale.

**P4 · MINUS · A3 5→7, A6 6→8 · Desktop-only · S**
Delete the three stacked hint paragraphs and fold them into the single status line with progressive disclosure. `EmbeddedWebMcpBrowser.tsx:403-417` → `webMcpSummary.ts:62-173`. Acceptance: unit — `summarizeWebMcpBrowser` output is the only always-on text; journey screenshot diff shows ≤1 banner row.

**P5 · MULTIPLY · A3 5→9, A6 6→9 · Desktop-only · M**
Make each strip row expandable and page-bound: result preview, duration, `at`, approval link, and the page/document generation it ran against. `WebMcpCallStrip.tsx:50-85`, `webMcpCalls.ts:53-84` (add `origin`/`generation`, remove the session-wide ambiguity by labelling rows from other pages). Acceptance: unit — a call from a prior page renders with a "different page" marker; journey — click a failed row, land on the transcript part.

**P6 · MINUS · A7 6→8 · Desktop-only · S**
Give A7 a real control instead of borrowing Disconnect. Split the overloaded slot (`EmbeddedWebMcpBrowser.tsx:374-400`) into *Pause agent* (retain page, revoke provider) and *Disconnect* (clear authority); add an explicit cancellation-complete acknowledgement after Pause. `desktop-webmcp-browser.js:119-124,521-525`. Acceptance: journey — pause aborts an in-flight call, page stays loaded, aria-live announces completion; unit — pause then resume needs no re-navigation.

**P7 · DIVIDE · A2 6→9, A8 3→6 · Desktop-only · M**
One trust surface: a single *Project browser access* card listing origin, granted capabilities, per-session grants, and revocation — merging the ephemeral pane state with `WebMcpAllowlistSection.tsx` semantics instead of leaving bridge grants in Services. `EmbeddedWebMcpBrowser.tsx:366-401` (replace action row with a link into it), `PermissionCard.tsx:199-203` (allow a saved scope for Desktop browser calls). Acceptance: unit — one card renders both grant kinds and revocation takes effect on the next call.

**P8 · MINUS · B1 3→7, A5 6→7 · Desktop-only · S**
Show registration reality: rejected-catalog reason, silent 64-tool truncation made visible, and a schema lint row (name >30, description >500, ADR-266-rejected `pattern`/`patternProperties`). `desktop-webmcp-browser.js:157-158` (return truncation flags), `native-webmcp.js:123-160`. Acceptance: unit — a 70-tool catalog renders "showing 64 of 70"; a `patternProperties` schema renders a lint warning.

**P9 · MINUS · A4 7→9 · Desktop-only · S**
Fix the approval card, not the pin: build a plain effect sentence from call data (origin + tool + operation + target + submit flag), add an approval countdown with an explicit timeout outcome, and show which scope covers the call. `PermissionCard.tsx:143-147,374-457`. Acceptance: unit — pending card renders a countdown and a timeout result; unannotated tools never auto-approve.

**P10 · PLUS · B3 4→8, B4 3→8 · Desktop-only · M**
A registration timeline: tool added/removed/changed with schema diff and definition digest, plus property-level mismatch paths. `WebMcpToolPanel.tsx:198-214` (timeline section), `native-webmcp.js:109,159,202`. Acceptance: unit — re-registering a same-named tool with a changed schema shows a diff row and invalidates stale results.

**P11 · MINUS · a11y · cross · S**
Make the mode tablist a real roving-tabindex widget and give the native view an announced boundary. `EmbeddedWebMcpBrowser.tsx:489-498`. Acceptance: journey — arrow keys move *focus* and selection; screen-reader announces pane change.

**P12 · PLUS · B5 2→8 · Desktop-only · S**
An app-author quickstart with a runnable page, registration → schema → descriptions → lifecycle → errors → agent testing, and a troubleshooting checklist, cross-linked from the tool panel. `docs/development-webmcp.md:1`. Acceptance: docs check — the example registers, appears in the panel, and the checklist lines map to real UI states.

## Top 8 by score gain per effort

| # | Proposal | Δ | Effort |
|---|---|---|---|
| 1 | P2 truncation/silent-failure removal | +7 | S |
| 2 | P8 catalog truth + schema lint | +8 | S |
| 3 | P4 hint-paragraph removal | +5 | S |
| 4 | P12 quickstart | +6 | S |
| 5 | P6 real pause/take-over | +2 | S |
| 6 | P9 approval effect statement | +2 | S |
| 7 | P11 tablist a11y | cross | S |
| 8 | P1 panel decomposition | +7 | M |

M-heavy P3, P5, P7, P10 and runtime-gated ADR-266 work follow once the S items land; P7 plus concurrent per-session views is what moves A8 off 3.

**Excellent** means the user can read one place — a call list scoped to the page in front of them — and trust it enough to say yes without opening a transcript.