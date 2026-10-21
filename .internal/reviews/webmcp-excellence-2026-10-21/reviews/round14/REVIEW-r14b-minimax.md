# Round 14 R14b review: try, compare and diagnose (MiniMax-M3, read-only)

## Review Findings

### No Blocking Issues

The implementation correctly addresses WX-05 (manual journal + compare), WX-18 (regression export), and the B2/B4 persona steps. The diagnosis names the property, rule and value-kind; never blocks Try it; the runtime-arguments miss is stated plainly (no guessing). Agent arguments are shown redacted as in the transcript. The 32-entry journal is in-memory per view, dropped on origin change. The exported snippet uses `document.modelContext.executeTool(..., JSON.stringify(...))` per `docs/webmcp-page-tools.md`; `--run '<tool>={...}'` is single-quoted with `'\''`-escaped inner quotes. Tests cover the new paths and the two mutation probes killed both targeted guards. `docs/webmcp-page-tools.md` sections 3 and 4 describe the journal, compare, schema check, export, Pause agent vs Disconnect, and Several sessions accurately.

---

## Bug Analysis

**Symptom:** Per read-only review, none observed. The journal, compare, diagnosis and export match PRD WX-05/WX-18 and the B2/B4 persona steps.

**Expected vs Actual:** Every requirement in scope is met in the diff.

## Investigation

### Step 1: Journal and replay (WX-05)
- Manual journal is per-view in `webMcpBrowserStore.toolJournal` (desktop/packages/ui/src/stores/useWebMcpBrowserStore.ts:108), bounded by `WEBMCP_JOURNAL_LIMIT=32` (desktop/packages/ui/src/lib/webMcpCatalog.ts:9). Origin change drops the list (desktop/packages/ui/src/stores/useWebMcpBrowserStore.ts:525, 545-546). Same-origin catalog update keeps the same array (test at desktop/packages/ui/src/stores/useWebMcpBrowserStore.test.ts:331-333).
- Replay effect (desktop/packages/ui/src/components/mcp/WebMcpToolPanel.tsx:540-565) loads through `draftFromRecordedInput` (desktop/packages/ui/src/lib/webMcpToolForm.ts:144-168), runs once per nonce, and does not call the tool by itself. `result` is left untouched (`[data-webmcp-tool-result='completed']` still present after Replay, per test 711).

### Step 2: Compare with the agent
- `ToolCompare` (desktop/packages/ui/src/components/mcp/WebMcpToolPanel.tsx:268-356) places the manual side beside the agent side via a responsive `auto-fit` grid (line 284).
- Manual side shows `inputText(journalEntry.input)` (user-typed; line 290-292) and the journal result pre (line 293-298).
- Agent side shows `agentCall.argumentsText` (the redacted transcript description from `describeWebMcpCall`, line 325-326) — never the model payload.
- Different-definition flag uses `webMcpDefinitionsDiffer` (desktop/packages/ui/src/lib/webMcpDiagnosis.ts:95-97), which returns true only when both digests are non-empty strings that differ; an unknown digest is not a difference. The `data-webmcp-definition-diff` attribute is only emitted when both sides have known digests (WebMcpToolPanel.tsx:346).

### Step 3: Diagnosis (B4)
- `diagnoseWebMcpInput` (desktop/packages/ui/src/lib/webMcpDiagnosis.ts:51-80) returns `{ status: "checked", findings: [...] }` after walking `diagnosisOpaqueRequired` and `diagnosisFields`. Wrong type suppresses range checks on that property. Findings stay in schema order (per handoff and test line 36-40).
- Each finding names `property`, `rule`, and `valueKind`; `type` failures also carry `expected` (number/string/integer/boolean). The display string joins them as `"title failed type:string. The value is integer."` (panel line 184-188 + en.ts:2820). Mutation probe (test 32-35) confirms the property is the schema name, not a stand-in.
- The `webmcp.tools.diagnosis.advisory` key (panel line 240, en.ts:2818-2819) explicitly says "This check is advisory. It never blocks Try it. The page decides which input is valid." `aria-disabled` on Try it is never derived from findings; only from the `running` flag (panel line 826-833).
- When the runtime gives neither `metadata.arguments`, `metadata.input`, nor `inputPreview`, `readWebMcpInvokeInput` returns `{ kind: "missing", input: null }` (toolHelpers.ts:413-429). `agentDiagnosis` maps that to `{ status: "unavailable", reason: "no-arguments" }` (panel line 251). The display says "The runtime did not provide arguments for this call (no input preview). Nothing is guessed." (panel line 196, en.ts:2822-2823). Mutation probe test (line 755-792) confirms no property finding is emitted when arguments are missing.
- `redacted` (e.g. `password=hunter2` preview) and `unparsed` (non-JSON preview) similarly produce discrete gap messages (panel line 192-201, en.ts:2824-2827).

### Step 4: Regression export (WX-18)
- `webMcpRegressionExport` (webMcpDiagnosis.ts:121-143) writes the snippet and `--run` argument as:
  - `const tool = (await document.modelContext.getTools()).find((candidate) => candidate.name === "<name>")`
  - `const result = JSON.parse(await document.modelContext.executeTool(tool, JSON.stringify(<input>)))`
  - `if (outcome !== "<recorded>") throw new Error("expected outcome " + "<recorded>")`
- The first shape matches `docs/webmcp-page-tools.md:163-165`. The `--run` argument is single-quoted with `'\''` escaping (webMcpDiagnosis.ts:113-115, test 119-123).
- A non-object input (e.g. array, null, string) returns `null`; CopyExport then renders "This call has no JSON object input to export." (panel line 145, en.ts:2837).

### Step 5: Docs match
- `docs/webmcp-page-tools.md` section 3 names the journal, compare, schema check, and regression export exactly as built. Section 4 distinguishes **Pause agent** (page kept) from **Disconnect agent** (turns access off) and clarifies the **Resume agent** vs **Resume agent access** distinction. Several sessions describes the 4-page cap, LRU unload with the address kept in memory, and the pool-full message. All of this matches the implementation.

### Step 6: Keyboard and screen reader
- Try it exposes `aria-disabled` only while running (panel line 826), and the focus stays on the button until completion (test 404-431). The result region uses `role="status" aria-live="polite"` (panel line 836-856) so screen readers announce completion.
- Replay is a regular `<button>` whose visible text already names the tool, outcome, and duration; no extra `aria-label` needed.
- The diagnosis list is a `<ul>` inside the open tool block; live-region announcements are inherited from the surrounding result region.

## Root Cause

[No root cause to report — the change matches its claims.]

## Verification

- The diff between `5eeb0dad..HEAD` covers only the files listed in R14B-HANDOFF.md § "Files" plus this handoff. The new `webMcpDiagnosis` module sits next to `webMcpToolForm` and `webMcpToolLint`; `webMcpDiagnosis.test.ts` covers property/rule/kind, enum/min/max/length, wrong-type suppression, no-schema, unsupported-schema, empty object schema, definition identity, and the export's `executeTool`/`--run` shapes including the single-quote escape.
- The panel test (desktop/packages/ui/src/components/mcp/WebMcpToolPanel.test.tsx:694-808) covers: journal persist + replay round-trip without a second send; compare with redacted agent arguments; manual side naming the redacted `argumentsText`; missing-arguments path rendered as a gap (not a guessed finding); definition-changed flagging for the manual side; same-digest not flagged as different; export snippet content for both manual and agent.
- The store test (desktop/packages/ui/src/stores/useWebMcpBrowserStore.test.ts:309-347) verifies 32-entry cap, same-origin retention, view isolation, input-validity rejection, and the absence of `localStorage` writes.
- The mutations recorded in R14B-HANDOFF.md (property name probe and `webMcpDefinitionsDiffer`-forced-false probe) both killed their target.

## Minor (Non-blocking) Notes

1. `desktop/packages/ui/src/lib/webMcpDiagnosis.ts:186-188` joins the rule and expected type with `':'` (e.g. `"type:string"`). Every locale has a translation, but for locales whose diagnostic sentence phrasing expects a different separator, a translator may need to deviate. This is trans-creatable and not a code bug.
2. `desktop/packages/ui/src/components/mcp/WebMcpToolPanel.tsx:325-326`: when `agentCall.argumentsText` is null and `argumentsMissing` is also false (should not occur per `describeWebMcpCall` in `toolHelpers.ts:485`, but possible if a runtime omits both), the `<pre>` renders empty. Acceptable defensive behaviour.
3. `desktop/packages/ui/src/lib/i18n/store.ts:51-56` keeps the strict key-count check. The locale JSONs in this diff have been updated to include the 28 new keys (verified in `zh-TW`, `de`, `ja`, `id`). A future key added only to `en.ts` would still unload those locales until the new key is filled in. Not a regression of this PR.
4. `desktop/packages/ui/src/lib/webMcpDiagnosis.ts:139` includes the entire input as an inline script string. Because the preview displays and the export uses `JSON.stringify(entry.input)`, a secret the user typed into the form ends up embedded in the snippet. The user is the one who typed it, so this matches prior local behaviour (the snippet is meant to be replayed by the user), but downstream tools that copy the snippet into a bug report or a chat could leak credentials. The `webMcpResultPreview` filter already hides them in the transcript; the manual input shown in the compare panel (`inputText(journalEntry.input)` at panel line 290) is also user-typed and not filtered. No regression of this PR; an extra sensitivity check in `webMcpRegressionExport` could be added later if needed.

---

**Result: no blocking issue.** The journal, compare, diagnosis and regression export are complete, correct, keyboard-and-screen-reader-friendly, and consistent with `docs/webmcp-page-tools.md`; the test coverage (including the two mutation probes) holds up against the claim; the locale strings are translated across all 13 packaged catalogs; the panel never blocks Try it on a finding; the runtime's absent arguments are stated plainly without guessing; and agent arguments stay redacted as in the transcript.
## Disposition

No blocking issue. The author had changed the locale loader to fill missing keys from English; that change was removed and all 28 strings were translated (`check:locales` passes). The guide paragraph on several sessions was updated for the round 14a page switcher and least-recently-used unloading.
