# M12 handoff: honest manual panel (WX-01, WX-03)

Date: 2026-10-21
Branch: `wx12-manual-panel`
Base: `7696232a`
State: local, uncommitted implementation. No commit, push, packaging, release or publication was performed.

## Controlling evidence

Read this worktree's `AGENTS.md`. The ignored controlling records are absent from this isolated worktree, so they were read without modification from `/Users/akiralam/code/ax-code-desktop/`:

- `.internal/prd/PRD-2026-10-21-webmcp-excellence-v1.md`, section 4, WX-01 and WX-03.
- `.internal/reviews/webmcp-excellence-2026-10-21/AUDIT-2026-10-21-codex-baseline.md`, B2, B4 and A5.
- `.internal/reviews/webmcp-excellence-2026-10-21/SYNTHESIS-kimi.md`, WX-01 and WX-03.

No accepted governance record was edited.

## Implementation

### WX-01

- `webMcpToolForm.ts` represents every property of a supported flat schema, including properties 25 through 30. Schemas with more than 128 properties use the complete JSON editor, with a visible size explanation. Nested, composed or otherwise unrepresentable schemas use JSON with a visible complexity explanation. No partial field form is returned.
- String and string-enum values retain their exact whitespace. Blank optional fields are absent until the person explicitly selects the per-field empty-string checkbox. Required strings can therefore send `""` explicitly. Numeric zero and boolean false are preserved. Defaults are displayed, never silently inserted.
- Declared `minimum`, `maximum`, `minLength`, `maxLength`, `enum`, `format` and `default` appear beside their fields. Defaults in sensitive fields are credential-filtered while the remaining constraints remain visible.
- Simple numeric bounds, Unicode code point lengths and enum membership produce field-and-constraint warnings before sending. A second explicit **Send anyway** sends the unchanged input. Format and defaults are informational; Desktop does not recreate the page/runtime schema validator.
- Missing required fields and impossible primitive conversions name the field and constraint. The JSON editor remains available for every field schema, so the input is always editable outside those field conversions.
- Input construction preserves own properties such as `__proto__` without changing object prototypes.

### WX-03

- `native-webmcp.js` preserves fixed outcome/reason metadata for native error replies, cancellation, deadlines and loss of connection/document identity. Exceptions never contribute their raw messages to manual diagnostics.
- `webmcp-manual-outcome.js` maps normal completion, returned application-error signals, thrown native tool errors, timeout, cancellation and uncertain completion for the manual IPC path. A completed transport carrying `isError`, `ok: false`, an error status, or a nonempty string in `error` or `errorText` is not successful. JSON-string and untrusted-result envelopes follow the transcript's existing signals.
- The panel also uses the transcript's `desktopWebMcpResultFailed` detector. Each outcome has its own visible label and `data-webmcp-tool-result` value. Only `completed` gets normal completion styling.
- Manual failures use `WEBMCP_FAILURE_REASONS` and `chat.toolPart.webmcp.reason.*`. The shared vocabulary gains `application-error` and `cancelled`; existing reasons cover unavailable tools, invalid input, timeout and provider loss. Obsolete manual `tool-unavailable` / `invoke-failed` messages are no longer emitted or selected. Existing unused translation entries were preserved.
- Uncertain completion uses the shared reason label, explicitly says completion is uncertain, and instructs the person to inspect the visible page for effects before trying again. It never retries automatically. Cancellation explicitly does not promise reversal of effects.
- Manual previews share the credential patterns and sensitive-name rules in `toolHelpers.ts`. They filter before truncating, parse JSON strings for sensitive-key filtering, bound depth/node count/collections and visible text (4,000 UTF-16 units), and render as inert React text. Raw exceptions are discarded. No result is logged, persisted, added to a conversation or granted to the agent.
- `EmbeddedWebMcpBrowser.tsx` carries the added optional outcome field through the existing IPC wrapper. No store imports or store boundaries changed.

## Tests and verification

All component tests use `src/test/dom.tsx`; no Testing Library dependency or source-text assertions were added. Tests exercise form inputs, rendered controls, native events and returned values.

| Command | Final result |
| --- | --- |
| `pnpm --dir desktop/packages/ui run type-check` | Passed |
| `pnpm --dir desktop/packages/ui exec vitest run src/lib src/components/mcp` | 176 files passed, 1 failed; 1,201 tests passed, 7 failed (locale integration issue below) |
| `pnpm --dir desktop/packages/electron exec vitest run src/native-webmcp.test.mjs src/desktop-webmcp-browser.test.mjs src/webmcp-manual-outcome.test.mjs` | Passed: 3 files, 76 tests |
| `pnpm run lint` | Passed for Electron, UI and web |
| `git diff --check` | Passed |

M12-related form, panel and shared-helper tests all pass in the requested UI run. Coverage includes padded strings, all 30 rendered properties, absent/empty/zero/false, constraint hints and advisory override, Unicode lengths, explained JSON fallback, all requested outcomes, real deadline expiry in the adapter fixture, cancellation, thrown tool errors, debugger loss, unknown IPC failure, bounded credential filtering, cyclic/deep output and inert HTML-like results.

### Locale integration requirement (not a green full UI suite)

The existing loader in `src/lib/i18n/store.ts` requires every packaged dictionary to have exactly the English key set. The 13 requested English-only additions therefore make non-English dictionary loads fail validation and fall back to English. Seven tests in `src/lib/i18n/store.test.ts` fail for this reason. This is a shipping integration blocker, not an unrelated baseline failure.

Causal check: temporarily replacing only `messages/en.ts` with its exact HEAD content made that test file pass **15/15**. The M12 English additions were restored immediately afterward. Other locale files and the strict loader were never changed. Translation integration must supply these keys before shipping; the exact list is below. No gate or assertion was weakened to hide the issue.

The current Node environment also emits an existing experimental localStorage warning; it is not the cause of the locale failures.

This task performed unit/DOM verification only. It does not establish native UI acceptance, screenshots, signed-runtime qualification or physical Windows/macOS/Linux execution. The implementation adds no platform-specific paths or APIs.

### Mutation probes

Each probe mutated one production behavior, ran the indicated behavioral tests, observed exit 1, and restored the exact pre-probe bytes in a `finally` block before the next probe. Final verification ran after restoration.

| Probe | Temporary regression | Test command suffix | Observed failure |
| --- | --- | --- | --- |
| No trim | Applied `.trim()` to the raw field string | UI `vitest run src/lib/webMcpToolForm.test.ts src/components/mcp/WebMcpToolPanel.test.tsx` | 4 failed, 18 passed; padded-string helper/DOM assertions failed |
| Property limit removal | Iterated `properties.slice(0, 24)` | Same two UI files | 2 failed, 20 passed; 30-property helper and rendered-field tests failed |
| Application-error detection | Made the manual result mapper always take its success branch | Electron `vitest run src/webmcp-manual-outcome.test.mjs src/desktop-webmcp-browser.test.mjs` | 8 failed, 52 passed; seven application-error shapes and the manual IPC error-payload test failed |

Ephemeral local execution logs are in `/tmp/m12-final-{typecheck,ui,electron,lint}.log`, `/tmp/m12-mutation-{no-trim,property-limit,application-error}.log` and `/tmp/m12-i18n-baseline.log`. The results above are the durable handoff record; these temporary logs are not repository artifacts.

## New English keys (only `messages/en.ts` was edited)

| Key | Text |
| --- | --- |
| `chat.toolPart.webmcp.reason.application-error` | The page tool returned an error or threw an exception. |
| `chat.toolPart.webmcp.reason.cancelled` | The page tool was cancelled. Effects already performed may remain. |
| `webmcp.tools.completed` | Completed |
| `webmcp.tools.uncertain` | Completion is uncertain. |
| `webmcp.tools.inspectPage` | Inspect the page to check whether the action took effect before trying again. |
| `webmcp.tools.sendEmpty` | Send an empty string for {field} when blank |
| `webmcp.tools.constraint` | Check {field}: {constraint}. |
| `webmcp.tools.advisory` | These checks are advisory. The page decides which input is valid. |
| `webmcp.tools.sendAnyway` | Send anyway |
| `webmcp.tools.jsonLarge` | This schema is too large for fields. Edit the complete input as JSON. |
| `webmcp.tools.jsonComplex` | This schema is nested or uses types or rules the fields cannot represent. Edit the complete input as JSON. |
| `webmcp.tools.useJson` | Use JSON editor |
| `webmcp.tools.useFields` | Use fields |


## Review fixes

Date: 2026-10-21. Applied in this worktree on `wx12-manual-panel`; all implementation remains uncommitted. No commit, push, packaging, release or publication was performed. This section supersedes the earlier verification totals and English-key inventory.

### Findings and decisions

- **M1:** An oversized result is `failed / result-too-large`; a definition changed after dispatch is `failed / definition-changed`. Neither is mapped to `uncertain / provider-gone`. The result-size reason states that effects may already have occurred. The adapter preserves a bounded marker when a response precedes the native acknowledgement, matches it to the invocation, and does not reject an active call for an unrelated oversized response. The existing `definition-changed` reason is reused; `result-too-large` is the only new result-size reason. Both reasons are accepted by the manual mapper and the transcript vocabulary/labels. Native, manual IPC, mapper, panel and transcript tests cover the outcomes and reasons; native tests cover early and acknowledged oversized responses and actual remove/re-register definition changes while the browser stays connected.
- **L1:** An already-expired deadline is `timeout / timeout` before dispatch. The native test asserts the reason and absence of an invoke command.
- **L2:** `input-too-large` is a separate shared reason for the input cap, distinct from schema mismatch. The editor displays 64 KiB (65,536 UTF-8 bytes of the serialized JSON object), associates that hint with its textarea, and checks the same representation as Electron before dispatch. UI and native tests reject a multibyte input above the cap and accept exactly 65,536 bytes; editor whitespace does not count after parsing the JSON object.
- **L3:** Required/type errors and declared hints/advisories use dedicated localized sentences naming the expected type, allowed choices or actual bound. Examples: "Enter a whole number for count" and "count must be at least 5". Defaults remain suggestions and sensitive defaults remain redacted. DOM tests render the real English constraint templates and cover required, number, integer, boolean, minimum, maximum, string lengths and enum choices.
- **L4:** Native labels retain their input associations; hints and field-specific warnings have stable IDs linked through `aria-describedby`. The same descriptions accompany empty-string checkboxes. JSON has a dedicated label plus limit/fallback descriptions. Index-based IDs remain valid even when field names contain spaces. Tests resolve every description reference, check the correct field's hint/warning, verify select and checkbox associations, and verify removal of obsolete warning references on edit.
- **L5:** DOM tests explicitly check label control associations, `aria-describedby`, both levels of `aria-expanded`, and the persistent `role="status" aria-live="polite"` region before and after completion.
- **L6:** The send button uses `aria-disabled` while the existing running guard prevents repeat dispatch. A deferred-promise DOM test asserts focus retention, absence of native `disabled`, the running/idle ARIA states, suppression of repeat activation and availability of a later run. Native Chromium focus behavior and physical screen-reader use were not exercised in this pass.
- **I1 decision:** A result-shaped timeout or cancellation is reported as `timeout` or `cancelled` on both surfaces, including JSON strings and untrusted-result envelopes. Explicit terminal status takes precedence over generic `isError` / `ok: false` flags. The shared UI outcome helper drives the panel and transcript; the Electron manual mapper mirrors that decision. Mapper, manual IPC, shared-helper, panel and rendered transcript tests cover the choice and cancellation aliases (`canceled`, `cancelled`, `aborted`). Cancellation wording continues to state that effects may remain.
- **I2:** Dispatch clears the acknowledged advisory state; success returns the action label to "Try it". A subsequent attempt checks and presents advisories again. Edits and mode changes clear obsolete warnings/results. The advisory/override DOM test verifies the successful send, cleared warning/action state, and renewed advisory on the next attempt.
- **H1:** Deferred as explicitly requested. Only `messages/en.ts` contains localization additions; no translated catalog or loader gate was changed. The previously documented locale integration requirement remains outstanding. The final inventory below replaces the old generic `webmcp.tools.constraint` entry with dedicated message keys.

### Final verification after mutation restoration

| Command | Result |
| --- | --- |
| `pnpm run typecheck` | Passed: Electron runtime syntax (200 files), UI TypeScript, web TypeScript |
| `pnpm --dir desktop/packages/ui exec vitest run src/lib/webMcpToolForm.test.ts src/lib/toolHelpers.webmcp.test.ts src/components/mcp/WebMcpToolPanel.test.tsx src/components/chat/message/parts/ToolPart.webmcp.test.tsx` | Passed: 4 files, 67 tests |
| `pnpm --dir desktop/packages/electron exec vitest run src/native-webmcp.test.mjs src/desktop-webmcp-browser.test.mjs src/webmcp-manual-outcome.test.mjs` | Passed: 3 files, 93 tests |
| `pnpm run lint` | Passed: Electron, UI and web |
| `git diff --check` | Passed |

This is focused unit/DOM verification, not a green full UI or localization gate, native UI acceptance, signed-runtime qualification, or physical Windows/macOS/Linux verification. The final logs are ephemeral local evidence at `/tmp/m12-review-final-{typecheck,ui,electron,lint}.log`.

### Review mutation probes

Every probe restored the exact original bytes in a Python `finally` block, checked restoration, and exited with test-runner status 1 for the targeted regression. Final verification above ran after all restorations.

| Probe | Temporary regression | Test file | Observed failure |
| --- | --- | --- | --- |
| M1 result | Changed oversized-result rejection back to `uncertain / provider-gone` | `native-webmcp.test.mjs` | 2 failed, 20 passed; both early and acknowledged oversized-result tests failed |
| M1 definition | Changed post-dispatch definition rejection back to `uncertain / provider-gone` | `native-webmcp.test.mjs` | 1 failed, 21 passed; connected-browser definition-change test failed |
| L6 disabled | Replaced `aria-disabled={running}` with `disabled={running}` | `WebMcpToolPanel.test.tsx` | 1 failed, 32 passed; running-button focus/ARIA contract failed |
| L6 guard | Removed the effective running guard | `WebMcpToolPanel.test.tsx` | 1 failed, 32 passed; repeat-activation dispatch-count assertion failed |

Probe logs: `/tmp/m12-review-mutation-{m1-result,m1-definition,l6-disabled,l6-guard}.log`. Summary: `/tmp/m12-review-mutation-summary.json`.

### Current English-only keys for translation integration

All 26 keys newly present relative to branch HEAD are listed below. The earlier generic `webmcp.tools.constraint` addition is no longer used or present in `en.ts`.

| Key | Text |
| --- | --- |
| `chat.toolPart.webmcp.reason.result-too-large` | The tool returned a result larger than 64 KiB. Its effects may already have occurred. |
| `chat.toolPart.webmcp.reason.input-too-large` | The input exceeds the 64 KiB limit (65,536 UTF-8 bytes of the JSON object). |
| `chat.toolPart.webmcp.reason.application-error` | The page tool returned an error or threw an exception. |
| `chat.toolPart.webmcp.reason.cancelled` | The page tool was cancelled. Effects already performed may remain. |
| `webmcp.tools.completed` | Completed |
| `webmcp.tools.uncertain` | Completion is uncertain. |
| `webmcp.tools.inspectPage` | Inspect the page to check whether the action took effect before trying again. |
| `webmcp.tools.sendEmpty` | Send an empty string for {field} when blank |
| `webmcp.tools.constraint.required` | Enter a value for {field}. |
| `webmcp.tools.constraint.number` | Enter a finite number for {field}. |
| `webmcp.tools.constraint.integer` | Enter a whole number for {field}. |
| `webmcp.tools.constraint.boolean` | Choose true or false for {field}. |
| `webmcp.tools.constraint.minimum` | {field} must be at least {bound}. |
| `webmcp.tools.constraint.maximum` | {field} must be at most {bound}. |
| `webmcp.tools.constraint.minLength` | {field} must contain at least {bound} characters. |
| `webmcp.tools.constraint.maxLength` | {field} must contain at most {bound} characters. |
| `webmcp.tools.constraint.enum` | Choose one of {bound} for {field}. |
| `webmcp.tools.constraint.format` | Expected format for {field}: {bound}. |
| `webmcp.tools.constraint.default` | Suggested default for {field}: {bound}. |
| `webmcp.tools.inputLimit` | Input limit: 64 KiB (65,536 UTF-8 bytes of the JSON object). |
| `webmcp.tools.advisory` | These checks are advisory. The page decides which input is valid. |
| `webmcp.tools.sendAnyway` | Send anyway |
| `webmcp.tools.jsonLarge` | This schema is too large for fields. Edit the complete input as JSON. |
| `webmcp.tools.jsonComplex` | This schema is nested or uses types or rules the fields cannot represent. Edit the complete input as JSON. |
| `webmcp.tools.useJson` | Use JSON editor |
| `webmcp.tools.useFields` | Use fields |
