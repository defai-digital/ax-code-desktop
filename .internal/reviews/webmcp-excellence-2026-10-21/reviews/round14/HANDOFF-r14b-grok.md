# Round 14b handoff (B2, B4)

Date: 2026-10-21. Branch: `r14-diagnose`. Base: `7cd2d383`.
Status: local implementation; no commit, push, packaging or publication performed.

## Scope

Controlling record: `.internal/prd/PRD-2026-10-21-webmcp-excellence-v1.md` (WX-05, WX-18; personas B2 and B4).
Round 13 judges at the worktree root scored B2 6/7 (`JUDGE-r13-codex.md` 6, `JUDGE-r13-deepseek.md` 7) and B4 6/6.
Those judge files were read and left untracked. Accepted PRDs, ADRs and specs were not edited.

The Page tools panel now keeps a manual journal, compares a manual run with the agent's latest transcript call, checks both inputs against the current schema, and copies a regression snippet. `docs/webmcp-page-tools.md` also describes Pause agent and several sessions.

## What shipped

1. **Manual journal (WX-05).** `toolJournal` on the per-view browser snapshot holds the last 32 Try it runs that were actually sent. Each row stores the tool, a JSON copy of the input, the outcome, the duration and the definition digest. Newest first. Memory only; an origin change drops the list, and a same-origin catalog update keeps the same array. Replay fills the form with that input so it can be edited. Replay does not call the tool and does not clear the result already shown. Pre-send validation is not journaled.
2. **Compare with the agent.** For the open tool, the panel shows the latest manual input and result beside the agent's most recent invoke from `collectWebMcpCalls`. The agent side shows the redacted `argumentsText` the transcript already shows. When both sides have a non-empty definition digest and the digests differ, the panel says so (`data-webmcp-definition-diff`). A missing digest is not a difference.
3. **Misuse diagnosis (B4).** `diagnoseWebMcpInput` checks the input against the current schema. It is advisory and never disables Try it. A finding names the property, the rule (`required`, `type`, `enum`, `minimum`, `maximum`, `minLength`, `maxLength`) and the value kind (`absent`, `null`, `array`, `object`, `string`, `number`, `boolean`, `integer`). The panel shows the digest the call ran against when that digest is known, and sets `data-webmcp-definition-changed` when it differs from the registered definition. When the runtime gives no `metadata.arguments`, no `metadata.input` and no ADR-266 `inputPreview`, the panel says the runtime did not provide arguments and does not guess. The model payload under `input.input` is not used. Display truncation (140 characters) is only for the compare text; diagnosis uses the redacted object.
4. **Regression export (WX-18).** Copy test writes a snippet that loads the tool with `document.modelContext.getTools()` and calls `document.modelContext.executeTool` with `JSON.stringify(...)`, then asserts the recorded outcome. Copy `--run` argument writes the equivalent `pnpm run webmcp:check` argument (`--run '<tool>={...}'`, single quotes escaped). The UI does not import the electron check script. A call with no JSON object input says it cannot be exported.
5. **Docs.** Section 3 of `docs/webmcp-page-tools.md` covers the journal, compare, schema check and export. Section 4 distinguishes Pause agent, Disconnect agent and Resume agent access, states that a pause does not roll the page back, and describes several sessions (one live page per coding session, at most four, shared project sign-in, hidden calls wait, switching hides rather than closes, a fifth page is refused with no separate user label).

The panel stays free of the session sync hooks. `WebMcpToolPanelConnected` reads the transcript and passes `agentCalls`. `EmbeddedWebMcpBrowser` renders that wrapper. The call strip uses the same `useWebMcpTranscriptCalls` hook.

## English strings

New keys exist only in `desktop/packages/ui/src/lib/i18n/messages/en.ts`. Other locale JSON files were not edited. `loadDictionary` used to reject a catalog whose key count differed from English, which unloaded every packaged locale after these keys were added. `completeLocaleDictionary` now rejects an empty catalog, unknown keys and non-strings, and fills missing keys from English. `script/check-locales.ts` still only rejects unknown keys.

| Key | English |
| --- | --- |
| `webmcp.tools.journal.title` | Manual journal |
| `webmcp.tools.journal.empty` | No Try it runs yet on this page. |
| `webmcp.tools.journal.memory` | The last 32 runs stay in memory for this page view. They are not saved to disk. |
| `webmcp.tools.journal.replay` | Replay {tool} ({outcome}, {duration}) |
| `webmcp.tools.journal.digest` | Definition {digest} |
| `webmcp.tools.compare.title` | Compare with the agent |
| `webmcp.tools.compare.manual` | Your run |
| `webmcp.tools.compare.agent` | Agent's latest call |
| `webmcp.tools.compare.noManual` | You have not run this tool on this page. |
| `webmcp.tools.compare.noAgent` | The agent has not called this tool in the recent transcript. |
| `webmcp.tools.compare.differentDefinitions` | Your run and the agent's call used different definitions ({manual} and {agent}). |
| `webmcp.tools.compare.input` | Input |
| `webmcp.tools.diagnosis.title` | Schema check |
| `webmcp.tools.diagnosis.advisory` | This check is advisory. It never blocks Try it. The page decides which input is valid. |
| `webmcp.tools.diagnosis.finding` | {property} failed {rule}. The value is {kind}. |
| `webmcp.tools.diagnosis.none` | The input matches the checks this panel can make. |
| `webmcp.tools.diagnosis.noArguments` | The runtime did not provide arguments for this call (no input preview). Nothing is guessed. |
| `webmcp.tools.diagnosis.unparsed` | The runtime sent an input preview that is not a JSON object, so individual properties are not checked. |
| `webmcp.tools.diagnosis.redacted` | The runtime marked this input as sensitive, so it is not checked property by property. |
| `webmcp.tools.diagnosis.digest` | Ran against definition {digest}. |
| `webmcp.tools.diagnosis.digestUnknown` | The definition this call ran against was not recorded. |
| `webmcp.tools.diagnosis.changed` | The definition changed since this run ({digest} then, {current} now). |
| `webmcp.tools.diagnosis.noSchema` | This tool does not publish an input schema, so the input is not checked. |
| `webmcp.tools.diagnosis.unsupported` | This schema is not a plain object of simple properties, so the input is not checked property by property. |
| `webmcp.tools.export.copyTest` | Copy test |
| `webmcp.tools.export.copyRun` | Copy --run argument |
| `webmcp.tools.export.copied` | Copied |
| `webmcp.tools.export.unavailable` | This call has no JSON object input to export. |

## Tests

- `webMcpDiagnosis.test.ts`: property, rule and value kind; enum, min, max and length; a wrong type suppresses range checks; empty versus missing schema; different-definition flag; `executeTool` snippet and `--run` argument.
- `WebMcpToolPanel.test.tsx`: journal and editable replay without a send; compare, diagnosis, definition difference and export; same digest is not flagged and a missing runtime input is not guessed; a changed definition is named. A finding does not set `aria-disabled` on Try it.
- `useWebMcpBrowserStore.test.ts`: last 32 runs per view, in memory, dropped on origin change.
- `webMcpCalls.test.ts`: invoke records `definitionDigest` and does not take arguments from the model payload.
- `toolHelpers.webmcp.test.ts`: a long argument stays available for diagnosis; only a real digest is read; empty metadata is missing.
- `webMcpToolForm.test.ts`: a recorded object reloads into fields, and a value the fields cannot show stays JSON.
- `store.test.ts`: a catalog may omit a new English key and keeps that English sentence; an empty catalog is still invalid.

## Mutation probes

Both probes edited `desktop/packages/ui/src/lib/webMcpDiagnosis.ts`, confirmed the tests failed, and restored the file. `cmp` against `/tmp/r14b-webMcpDiagnosis.ts.bak` matched after restore.

| Probe | Deliberate mutation | Result |
| --- | --- | --- |
| Failing property | Type findings reported `property: "mutated"` instead of the schema field name | Killed. `webMcpDiagnosis.test.ts` expected `title` and `count` and received `mutated`. Exit 1. Log: `/tmp/r14b-mutation-property.log`. |
| Different definition | `webMcpDefinitionsDiffer` forced false | Killed. The unit expectation `toBe(true)` failed, and the panel test no longer found `[data-webmcp-definition-diff]`. Exit 1. Log: `/tmp/r14b-mutation-differ.log`. |

## Verification

| Command | Result |
| --- | --- |
| `pnpm run typecheck` | Passed (electron runtime, UI `tsc`, web `tsc`) |
| `pnpm run lint` | Passed (electron, UI, web) |
| `pnpm run check:boundaries` | Passed. Store boundaries, IPC 42/58/58/47, source-text ratchet 42 baseline with no new entries, sibling deps 3528 files, source ownership 3667 files, runtime pin 7.28.0, release contract app 7.28.0 / SDK 2.6.41 |
| `pnpm --dir desktop/packages/ui run test` | 642 files, 4481 tests passed |
| `pnpm run build` | Passed (`build:shell`, 3 tasks, about 62s) |
| `node desktop/packages/electron/scripts/e2e/project-browser-webmcp.mjs` | Passed. W1 discovered 4 page tools; W2 ran `add_task` (page error `application-error`, then `completed`); W5 paused and resumed with the page, address and result retained. CSP clean. No uncaught renderer exceptions. Exit 0 |
| `git diff --check` | Passed |

The native journey clicks the existing Try it, Page tools and Pause agent controls. It does not open the new journal, compare, schema check or export controls. Those paths are covered by the panel tests above.

## Files

Modified: `WebMcpToolPanel.tsx` and its test, `EmbeddedWebMcpBrowser.tsx` and its test, `WebMcpCallStrip.tsx`, `en.ts`, `i18n/store.ts` and its test, `toolHelpers.ts` and `toolHelpers.webmcp.test.ts`, `webMcpCalls.ts` and its test, `webMcpCatalog.ts`, `webMcpToolForm.ts` and its test, `useWebMcpBrowserStore.ts` and its test, `docs/webmcp-page-tools.md`.

Added: `webMcpDiagnosis.ts` and its test, `hooks/useWebMcpTranscriptCalls.ts`, `components/mcp/WebMcpToolPanelConnected.tsx`, this handoff.
