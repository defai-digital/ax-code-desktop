# Round 12 X12 review: browser recap at landing (deepseek-flash, read-only; glm-5.3 did not finish)

Review closed: `34a71e552bba1c10` — **approve**, 0 blocking.

## WX-13 Browser Recap — final review

**Verdict:** no blocking issue. Four findings recorded, all cited above.

### Findings by severity

| Sev | Id | Location | Issue |
|---|---|---|---|
| MEDIUM | `35571f2861a0fed9` | `ReviewLandingBrowserEvidence.tsx:25` (used `:47-50`) | Catalog read is unscoped: a **turn-scoped** call list is paired with the **process-wide** browser snapshot and neither `state.sessionID` nor `state.directory` is checked, while `MissionControlRow.tsx:88-90` gates the same store on sessionID. Another session's or page's tools can be named "never called". Test `:71-77` sets a catalog with no sessionID, so the suite cannot catch it. |
| LOW | `8db64e8d9b175dc9` | `:64-67`, `en.ts:9-10` | Header says "page-tool calls" but `count` is every WebMCP operation; one invoke + three navigations reads as four tool calls and inflates the denominator beside the not-called list. |
| LOW | `2cd70098323489cd` | `:11`, `:30`, `webMcpCalls.ts:31,61` | Three silent caps (60 messages / 200 calls / 50 rows) applied while `:11` claims the counts "cover the whole turn". |
| LOW | `4f122548438226c5` | `:92-96` | "Never called" is turn-scoped but page-labelled; bare names instead of the zero counts WX-13/W6 specify; duplicate registrations repeat; the `:48` invoke gate hides the block for act/read-only turns. |

### Checks requested

1. **"Never called" correctness** — invoke-only gate is defensible; catalog scoping is wrong (MEDIUM). Not reproduced at runtime (no app run).
2. **Re-render cost** — sound. Equal JSON yields the same primitive, so no re-render per streamed token; work bounded to ~200 calls × 5 short fields; mirrors `WebMcpCallStrip.tsx:18-26`.
3. **Untrusted text** — no XSS path (React text, never HTML). Gaps: page-supplied `toolName` is not length-capped and has no `unicodeBidi: "plaintext"` (app precedent: `ToolPart-impl.tsx:533,554,610`, `StaticToolRow.tsx:252`); same pre-existing gap as the strip.
4. **"Calls, not test results"** — honest wording ("Tried…"), but the caveat exists only in a `title` tooltip (`en.ts:11`): absent on touch, often unannounced, and the `<details>` summary never states it.
5. **Accessibility** — native `details/summary` is keyboard-operable and failures are worded, not color-only. Weak: the trigger's accessible name never says it opens the browser; the `max-h-40 overflow-auto` list is not focusable; `key={index}` over a reversed slice.
6. **14 locales with `{names}`** — complete. All 8 keys in all 14 catalogs; `check:locales` enforces placeholder-set equality (`{count}`, `{failed}`, `{names}`); `kind.other` and all 8 failure reasons exist, so no raw key leaks. Gap: the separator `", "` is hardcoded in `en` (`:94`), so locales wanting `、`/`،` cannot express it.

**Verification:** `type-check` `555a4f8db4bf25d8`, `lint` `d4d4fae878be2221`, focused `vitest` `157b2a019bb4de6d`, `check:locales` `fac0f446d99c10cb` — all passed. Full UI suite and e2e/WebMCP journeys were not run; the MEDIUM item is a confirmed static read against an established in-repo scoping pattern, not a reproduced failure. No files were modified.
## Dispositions

- MEDIUM catalog scoping: fixed. The recap reads the page's tools only when the project browser serves this session; a test
  shows another session's page never appears as "not called", and a mutation probe that removes the check fails it.
- LOW count wording: fixed. The summary counts "steps" (every browser operation), retranslated in all 13 locales.
- LOW silent caps: the comment now states the scan window and limits; the visible cap stays at 50 rows.
- LOW never-called presentation: duplicate tool names are removed; zero counts and act/read-only turns stay as recorded scope
  for WX-13's runtime half (WX-16), since the recap cannot know a page's tools when the turn never listed them.
- Untrusted text: tool names are capped at 80 characters and isolated for bidirectional text.
- Calls-not-results caveat: shown inside the recap as well as in the tooltip. The list is focusable for keyboard scrolling;
  rows are keyed by call id. The hard-coded list separator stays (LOW) until a locale needs another.
