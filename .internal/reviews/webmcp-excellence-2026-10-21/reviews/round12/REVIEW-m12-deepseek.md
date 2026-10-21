# Round 12 M12 review (deepseek-flash, read-only)

## Review — M12 (WX-01 honest manual forms, WX-03 honest outcomes)

**Scope and evidence limitations.** This session is read-only with no shell tool, so `git diff HEAD` could not be produced and no command could be executed. I reviewed the current tree by direct file reads plus `grep`/`glob`. `.internal/prd/PRD-2026-10-21-webmcp-excellence-v1.md` is absent from this worktree and the main-repo copy was denied, so the checklist was applied as restated in `M12-HANDOFF.md` and in your prompt. No finding below rests on an executed check; the handoff's own reported suite results are consistent with what the code shows, but I did not reproduce them.

Files reviewed: `webMcpToolForm.ts`, `WebMcpToolPanel.tsx`, `toolHelpers.ts`, `webmcp-manual-outcome.js`, `native-webmcp.js`, `desktop-webmcp-browser.js`, `EmbeddedWebMcpBrowser.tsx`, `messages/en.ts`, `i18n/store.ts`, `script/check-locales.ts`, `script/localization-catalog.ts`, `.github/workflows/desktop-ci.yml`, plus the three touched test files.

---

### HIGH

**H1. 13 new English keys have no translations; every non-English locale now fails validation (CI gate red + runtime fallback to English).**
`desktop/packages/ui/src/lib/i18n/messages/en.ts:2670-2683` adds the 13 keys. Nothing was added to the 13 translated catalogs (`zh-TW.json`, `zh-CN.json`, `ja.json`, `ko.json`, `fr.json`, `de.json`, `id.json`, `it.json`, `pt-BR.json`, `ru.json`, `es.json`, `tr.json`, `vi.json` — confirmed absent by search).

Three separate consequences, all anchored in code:

- `script/localization-catalog.ts:31` emits `missing or empty <key>` for every English key absent from a catalog; `script/check-locales.ts:28-43` runs that for all 13 locales, so `pnpm run check:locales` fails with ~156 errors. That command is a required CI step: `.github/workflows/desktop-ci.yml:68`.
- `desktop/packages/ui/src/lib/i18n/store.ts:51-56` rejects any catalog whose key count differs from `enDict` (`throw new Error("Invalid language catalog")`), and `store.ts:85-93` then falls back to `locale: "en"` with `loadingError: true`. So a Chinese/Japanese/German… user gets an entirely English UI, not just the new panel.
- `desktop/packages/ui/src/lib/i18n/store.test.ts:37-47` (and the other locale-iterating tests) assert `loadingError: false` and full key parity, which matches the handoff's "7 failed" report.

The handoff discloses this as a shipping blocker and it is one: this is a localization regression plus a red required check, not a follow-up nicety. The English-only key additions cannot merge without the catalog updates.

---

### MEDIUM

**M1. Over-sized result and mid-invocation tool-definition change are reported as `uncertain`/`provider-gone`, so the panel claims the browser disconnected when it did not.**
`desktop/packages/electron/src/native-webmcp.js:227-233`:

```js
Date.now() >= request.deadline ||
byteSize(result.output) > MAX_RESULT_BYTES
) {
  reject(invocationError(
    Date.now() >= request.deadline ? "timeout" : "uncertain",
    Date.now() >= request.deadline ? "timeout" : "provider-gone",
  ))
```

`finish()` runs when the page reported `WebMCP.toolResponded`, i.e. the tool invocation **did** complete; the rejection is caused by output size (`MAX_RESULT_BYTES`, 64 KiB) or by `definitionDigest(...) !== request.digest` (line 225), not by losing the connection. Through `manualToolFailure` (`webmcp-manual-outcome.js:34`) and `WebMcpToolPanel.tsx:99-108`, the user then reads *"Completion is uncertain. The project browser is no longer connected."* — a false statement about the browser state, in the one feature whose purpose is honest outcome reporting. There is no reason code for "result too large / tool changed", so the vocabulary is the fix point (the panel correctly adds "inspect the page before trying again", and nothing auto-retries).

---

### LOW

**L1. A pre-dispatch deadline expiry is reported as `failed`/`page-changed`.**
`native-webmcp.js:190-199` folds deadline expiry into the same guard as generation/origin/frame mismatch and throws `invocationError("failed", "page-changed")`. The user-facing text becomes "The page changed after the tools were listed." (`chat.toolPart.webmcp.reason.page-changed`). The manual path sets `deadline: Date.now() + 30000` immediately before dispatch (`desktop-webmcp-browser.js:628`) so it is hard to hit there, but the same codes now feed a user-visible surface and should not say "page changed" for an expired deadline.

**L2. The 64 KiB input cap is reported as `invalid-input`.**
`native-webmcp.js:207-214` throws `invocationError("failed", "invalid-input")` when `byteSize(request.input) > 65536`, which the panel renders as "The input does not match the tool's schema." (`toolHelpers.ts:265` → `WebMcpToolPanel.tsx:107`). The JSON editor accepts arbitrarily large text and shows no size limit, so a user meets an unexplained limit described as a schema mismatch.

**L3. Invalid-input messages surface raw schema tokens as prose.**
`webMcpToolForm.ts:69` (`constraint: "required"`), `:75` (`constraint: field.kind` → `"number"`/`"integer"`), `:78` (`"boolean"`), rendered via `webmcp.tools.constraint` = `"Check {field}: {constraint}."` (`WebMcpToolPanel.tsx:69-74`, key at `en.ts:2676`). The result is "Check count: number." / "Check flag: boolean." / "Check email: required." — not localized words, and the number case does not say what was expected. Same for warnings: `"Check count: minimum."` never names the violated bound. The adjacent constraint hints (`WebMcpToolPanel.tsx:157-165`) do carry the bound, so this is wording, not correctness.

**L4. New field constraints/descriptions are not programmatically associated with their inputs.**
`WebMcpToolPanel.tsx:150-165`: the `<label htmlFor>` contains only the name/kind/description span; the constraint paragraph (`data-webmcp-constraints`) and the warning block are siblings with no `aria-describedby`/id link. A screen-reader user tabbing into `count` hears "count * · number" but not "minimum: 5", which is exactly the information WX-01 added. Labels themselves are correctly associated (real `htmlFor`, native `input`/`select`/`textarea`, no click handlers on non-interactive elements), and results are announced through `role="status" aria-live="polite"` (`:236-251`).

**L5. No test asserts the keyboard/screen-reader contract, although the PRD requires it.**
`WebMcpToolPanel.test.tsx` contains zero `role=`/`aria-*`/`getByLabel` assertions (only `container.textContent` and `data-webmcp-tool-result` selectors). The form/label/live-region/`aria-expanded` behavior required by WX-01's accessibility clause is therefore unverified rather than verified-by-omission.

**L6. The send button is `disabled` while running, which drops keyboard focus.**
`WebMcpToolPanel.tsx:229-233`: `disabled={running}` on the focused button moves focus to the document in Chromium; with a 30 s deadline a keyboard user loses their position every run. `aria-disabled` plus an in-handler guard (the `if (running) return` at `:64` already exists) preserves focus.

---

### INFO

**I1. Result-shaped cancellation/timeout is bucketed as `application-error`, so the new `cancelled`/`timeout` outcomes never fire for them.**
`toolHelpers.ts:233` (`WEBMCP_FAILURE_STATUSES` includes `timeout|canceled|cancelled|aborted`) and `:475` are applied before any status-specific branch, and `webmcp-manual-outcome.js:19-22` does the same. A tool that *returns* `{status: "timeout"}` is reported to the user as "The page tool returned an error or threw an exception." rather than "did not answer in time" / "was cancelled". The detector is shared with the transcript, so changing it changes both surfaces — worth a deliberate decision rather than a drive-by edit.

**I2. Warnings/result stay stale after a successful send.**
`WebMcpToolPanel.tsx:77-81` only clears `warnings` on edit or mode toggle, so after "Send anyway" succeeds the advisory block and the "Send anyway" button label persist (`:220-233`); a subsequent click sends with no new advisory pass. Cosmetic, but it makes the primary action's label lag the state.

---

### Checked and consistent (no finding)

- **Exact input fidelity:** `toolInput` (`webMcpToolForm.ts:60-83`) never trims strings, omits blank optional fields, sends `0`/`false` intact, and required strings can send `""` only via the explicit per-field checkbox; values are read with `Object.hasOwn`, and the accumulator is `Object.create(null)` so `__proto__` is preserved as data (`:65`). The Electron fixture asserts `{ text: "  exact  ", zero: 0, off: false, empty: "" }` (`desktop-webmcp-browser.test.mjs:956`).
- **No silent property limit:** every property is rendered; >128 properties and any unrepresentable/nested/composed schema fall back to JSON *with* a visible reason (`webMcpToolForm.ts:23-35,54`; `WebMcpToolPanel.tsx:194-198`).
- **Advisory-only constraints:** violations produce warnings and a second explicit send (`:77-81`, `:220-233`); nothing advisory blocks dispatch except a genuine type/required conversion, and the JSON editor remains available for those (`:207-219`).
- **Redaction:** `webMcpResultPreview` filters before truncating, parses JSON strings, bounds depth/nodes/collections/text, renders as inert `<pre>` text, and a sensitive field name redacts `default` (`toolHelpers.ts:328-369`; `WebMcpToolPanel.tsx:161`). Thrown native errors lose their message (`native-webmcp.js:9-10`); the Electron test asserts `hunter2` never reaches the reply (`desktop-webmcp-browser.test.mjs:976-977`).
- **No auto-retry anywhere**, and cancellation text does not promise reversal (`en.ts:2671`).
- **Platform:** no OS-specific branches or APIs in the new code; the panel is plain DOM/CSS. Real Windows/macOS/Linux and native-UI behavior remain unverified, as the handoff states.

---

### Bottom line

**Not ready to merge.** The one blocker is **H1** (missing locale entries: red `check:locales` gate plus English-only UI for 12 locales), which the handoff already flags and which needs the 13 keys in all 13 catalogs. **M1** should be fixed in the same pass if WX-03's honesty claim is to hold, since it currently tells users the browser disconnected when it did not. L1–L6 are worth fixing or explicitly deferring with a tracked item; I1–I2 are judgement calls on shared transcript behavior.