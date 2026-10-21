## Evidence read

PRD, baseline audit, research, and source: `WebMcpToolPanel.tsx` (217 lines, the whole builder surface), `webMcpToolForm.ts`, `WebMcpCallStrip.tsx`, `toolHelpers.ts:344-389`, `useWebMcpBrowserStore.ts:211-220`, `native-webmcp.js:123-184`, `desktop-webmcp-browser.js:605-631`, `webMcpSummary.ts:22-55`, `docs/development-webmcp.md`. Three findings shape everything below:

1. **Annotations are captured then dropped.** The adapter keeps `annotations` (`native-webmcp.js:138`), but `readWebMcpCatalog` (`useWebMcpBrowserStore.ts:216-218`) destructures only name/description/schema, and `WebMcpToolDefinition` (`:36-40`) has no field for them.
2. **A rejected catalog is indistinguishable from an empty page.** `native-webmcp.js:155-158` catches any invalid/duplicate/oversized tool and sets `available=false` + wipes tools; `WebMcpBrowserErrorCode` (`store:18-33`) has no such member. The panel then returns `null` (`panel:196`), so the tools simply vanish.
3. **Manual runs are thrown away.** `tryTool` returns `{ok, output|reason}` only, discards the caught error (`browser.js:628-630`), logs nothing (`:605-608`), and the panel styles any `ok:true` as success even when the page returned an error payload (`panel:93-100`).

## Proposals

| # | Op | Δ step | What changes | Scope | Effort | Acceptance test |
|---|---|---|---|---|---|---|
| 1 | MINUS | B2 +2, A4 +1 | Fix destructive form defaults: stop trimming strings (`webMcpToolForm.ts:40`), stop silently dropping properties past 24 (`:19`), keep siblings as fields when one property is nested (`:16,27`), label unsupported constraints | Desktop | S | Unit: `"  two  "` round-trips; 30-property schema yields 30 fields; `{a:{type:object},b:{type:string}}` yields one field + one JSON sub-editor |
| 2 | MINUS | B1 +2, B4 +1 | Delete the vanishing panel: `panel:196` returns `null` when the catalog is empty. Render "No page tools registered — why?" linking the registration diagnostics of #10 | Desktop | S | Panel test: `origin` set, `catalog: []` → notice rendered, zero tool rows |
| 3 | PLUS | B5 +6 | Authoring quickstart: registration snippet, schema/description rules, lifecycle (`toolchange`), error conventions, then "how to test it from here" reusing #5/#6; link from the panel header and `docs/` | Desktop | S | Docs link test + journey asserts the panel's help control opens the quickstart |
| 4 | PLUS | B4 +4, A5 +1 | Structured manual failure: carry `reason`, `message`, `phase` (`input-rejected`/`page-threw`/`registration-gone`/`navigated`), one next action; treat an error-shaped output as failure, not success (`panel:93-100`, `browser.js:628`) | Desktop (exact message text: runtime pending) | S–M | Panel test: `{ok:false,reason,message}` shows message; `{ok:true,output:{error:"x"}}` renders `data-webmcp-tool-result="error"` |
| 5 | PLUS | B1 +1, A2 +1 | Preserve `annotations` through `readWebMcpCatalog`, add to `WebMcpToolDefinition`, render read-only / may-change-state / untrusted-output / debugging badges in the row header | Desktop | S | Store test: annotations survive; panel test asserts a badge for `consequentialHint` |
| 6 | DIVIDE | A5 +1, B4 +1 | One refusal vocabulary: manual runs reuse the transcript's `reason` + `nextAction` codes (`toolHelpers.ts:372-377`) instead of a second ad-hoc set, so 14 locales translate one list | Desktop | S | Unit: reason-code table shared by `describeWebMcpCall` and the manual result mapper |
| 7 | PLUS | B1 +5, B4 +2 | Schema contract per tool: raw `inputSchema` as formatted JSON with copy, plus lint (name >30, description >500, param >150, missing description, non-object schema, >24 properties, non-string enum, and `pattern`/`patternProperties` as ADR-266-rejected) | Desktop | M | Lint unit tests over fixture schemas; journey finds `[data-webmcp-schema]` and the `pattern` warning |
| 8 | PLUS | B3 +3, B4 +2 | Registration diagnostics: replace the silent catch (`native-webmcp.js:155-158`) with a reason naming the tool and rule; add `invalid-catalog` to the error codes; emit `catalogDiagnostics`; keep rejected tools unusable but show the last valid set as stale | Desktop | M | Adapter test: duplicate name → diagnostic, neither ambiguous tool in `tools`; journey: 300-char name shows a named reason |
| 9 | PLUS | B2 +3, B3 +1 | Manual run journal: return `durationMs`, `inputDigest`, `definitionDigest` from `browser.js:605-631`, bounded ring (32) in main, read via new action; panel marks runs stale when the digest changed. Never written to transcript or disk | Desktop | M | Adapter test: re-register same name with new schema → prior entry flagged stale; ring capped at 32 |
| 10 | MULTIPLY | B1 +1, B2 +1, B4 +1 | Split the overloaded tool row into identity (name/title/full description/hints), contract (schema + lint + generated form), history (agent calls + manual runs) instead of one disclosure holding form and result (`panel:126-179`) | Desktop | M | Panel test asserts three labelled regions per `[data-webmcp-tool]` |
| 11 | DIVIDE | A1 +1, A6 +1, B1/B2/B4 +1 each | One home for page tools: the panel becomes the place showing registrations, lint, the agent's calls *for that tool*, and manual runs; `WebMcpCallStrip` rows link into it instead of duplicating 140-char arguments (`strip:70-83`) | Desktop | M | Journey: click a strip row → matching tool section expanded and focused |
| 12 | PLUS | B2 +3, A6 +1 | Replay: seed a tool's form from the selected agent call (agent args and your args side by side, "compare"); exact redacted JSON needs runtime `inputPreview` (`toolHelpers.ts:366-370`) | Desktop; exactness runtime pending | M | Panel test: `initialInput` prefills and `invoke` receives those values; journey seeds from a fixture transcript |
| 13 | PLUS | B2 +1, B5 +2 | Turn a run into a test: copy `document.modelContext.executeTool(...)` with assertions, or the Desktop UI-WebMCP `call` form, from the #9 journal entry | Desktop | S–M | Serializer unit snapshot; emitted snippet runs against the fixture app |

## Top 8 by score gain per effort

1. **#1 form correctness** (3 pts, S) — the cheapest real B2 gain; today the tool silently changes what you typed.
2. **#2 kill the vanishing panel** (3, S) — turns "is it broken?" into a next step.
3. **#3 authoring quickstart** (6, S) — B5 from 2 to 8; nothing else buys that ratio.
4. **#4 structured manual failures** (5, S–M) — fixes both the swallowed error and false success styling.
5. **#5 annotations surfaced** (2, S) — data already captured; pure plumbing plus badges.
6. **#6 one refusal vocabulary** (2, S) — prevents a second, untranslated error dialect.
7. **#7 schema view + lint** (7, M) — the single biggest B1 jump; also makes #3 concrete.
8. **#8 registration diagnostics** (5, M) — B3's only real lever; without it every lifecycle bug looks like an empty page.

Next tier: #9, #11, #12, #13, #10 — they depend on #4/#5 and should land after the reason codes stabilize.

**What would make a user call this excellent:** the moment a page tool misbehaves, the app tells you *which* tool, *which* property, *why* the runtime or the page refused it, what it looked like last time it worked, and one click turns that into a test — instead of a collapsed list that quietly disappears.