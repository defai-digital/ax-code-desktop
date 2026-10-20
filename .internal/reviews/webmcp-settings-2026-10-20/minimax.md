## Read-Only Advisory Review — desktopUiWebmcp.ts & hooksLoad.ts

The two observed "crash on `{}`" and "missing role coverage" fixes are correctly implemented in `hooksLoad.ts` (`trusted`/`file` shape guard at the top of `isHookWorkspace`) and in `desktopUiWebmcp.ts` (the expanded `CONTROL_SELECTOR` now covers `option`, `menuitem`, `menuitemcheckbox`, `menuitemradio`, and the `click`/`fill` paths now call `element.focus({ preventScroll: true })` before mutating). The remaining surface area still has concrete gaps. I checked every branch — `resolve`, `fillable`, `nameOf`, `compact`, `snapshot`, `installDesktopUiWebMcp`, and the entire hooks type guard. Findings below are ordered by impact.

**Acknowledged dev-only limits (NOT bugs, NOT counted in findings):**
- Unpackaged + opt-in via `__AX_CODE_DESKTOP_ELECTRON__.uiWebMcpEnabled` + temporary profile + stub runtime. These are intentional, gated by the main process, and the prompt explicitly excludes the website browser provider. The `win.top !== win` / `win.isSecureContext` / bridge-flag checks in `installDesktopUiWebMcp` are correct for this surface.
- Truncation at `MAX_CONTROLS = 100` is now paged via `offset`/`nextOffset`. The cap is a documented dev-tool limit; the math (`nextOffset` is `null` when remaining ≤0) is correct.
- The credential regex on `fillable` is intentionally loose and is layered defense, not the only gate — the type itself is excluded upstream.

---

### [MEDIUM] — Shadow DOM controls are never enumerated or clickable

**Category:** Correctness / Accessibility
**Location:** `desktop/packages/ui/src/lib/desktopUiWebmcp.ts`, the `snapshot` body where `doc.querySelectorAll<HTMLElement>(CONTROL_SELECTOR)` runs.
**Description:** `querySelectorAll` does not pierce shadow roots by default. Settings pages in this codebase use Web Components / lit-style custom elements for the numeric stepper and icon-button controls flagged as a11y gaps. Those subtrees are invisible to `get_ui_state`, `click`, and `fill`.
**Impact:** The model sees an "Unlabeled numeric field" row, can read its `aria-label`, but cannot find the inner `+` / `−` buttons or focusable inputs because they live in a shadow root. It also cannot enumerate the 33 Shortcuts capture fields if they are hosted inside a custom `<shortcut-row>` component. This is exactly the surface where the user reported "icon buttons" and "unlabeled numeric fields".
**Fix:** Walk every `element.shadowRoot` (and recursively `shadowRoot.querySelectorAll`) in parallel to the light-DOM query, and include shadow-root children in `elements`. Keep `targets.set` keyed by the original element. Add a `MutationObserver` on `document` and each discovered shadow root that bumps `generation` and clears `targets` when children inside a shadow root change.
**Regression case:**
1. Mount `<x-settings><input type="text" aria-label="Nickname" /></x-settings>` where `x-settings` is a custom element with `shadowRoot` containing the input.
2. Call `ax_desktop_get_ui_state`.
3. **Expect:** `controls[*].name === "Nickname"`. **Fail now:** empty `controls`, `total: 0`.

---

### [MEDIUM] — Native non-text input types are unreachable via `ax_desktop_fill`

**Category:** Correctness
**Location:** `desktopUiWebmcp.ts`, the `fillable` predicate (`if (element instanceof HTMLInputElement && !["text", "search"].includes(element.type)) return false`).
**Description:** Settings almost universally contain `type="number"`, `type="email"`, `type="url"`, `type="tel"`, `type="time"`, `type="date"`, `type="datetime-local"`, `type="month"`, `type="week"`. The whitelist excludes all of them. `click` also rejects them ("Use fill for text fields; other input types are unavailable"). There is no third path, so the model is permanently locked out of a large slice of real settings.
**Impact:** `get_ui_state` surfaces these controls (they pass `visible`), but every interaction attempt throws. The 15 settings pages the user is auditing include the Shortcuts page (capture fields can be `<input>` elements) and any numeric/date/time control. Combined with the focus-before-fill fix not blurring the filled element (next finding), there is currently no way to exercise or test most form fields.
**Fix:** Extend the whitelist per type with a sanitiser:
- `number`: coerce to `Number(value)`, clamp to `min/max/step` if defined, fall back to empty string if `NaN`.
- `email`/`url`/`tel`: pass through after a length check; rely on the browser's own validity for format.
- `time`/`date`/`datetime-local`/`month`/`week`: validate against the format regex per spec (e.g., `^([01]\d|2[0-3]):[0-5]\d$` for time) and reject otherwise.
Always set via the prototype `value` setter and dispatch `input` then `change`.
**Regression case:**
1. Render `<input type="time" aria-label="Quiet hours start" />`.
2. `ax_desktop_get_ui_state` → returns ref. **Expect fillable === true.**
3. `ax_desktop_fill({ ref, value: "22:30" })` → succeeds.
4. Render `<input type="number" min="1" max="10" aria-label="Poll interval" />`.
5. `ax_desktop_fill({ ref, value: "11" })` → **expect:** succeeds, value coerced/clamped to `10`; **currently throws** "Field is not available for filling".

---

### [MEDIUM] — `ax_desktop_fill` does not blur the target, so the *filled* field's `onBlur` validation never runs

**Category:** Correctness (regression of a partially-applied fix)
**Location:** `desktopUiWebmcp.ts`, the `execute` body of `ax_desktop_fill` (and analogous `ax_desktop_click`).
**Description:** The fix added `element.focus({ preventScroll: true })` before mutating. That only blurs the *previously* focused element — it does not blur the element that was just filled. If validation lives on the filled field's `onBlur` (which is the standard React Hook Form / MUI pattern, and which matches the user's "NumberInput commits out-of-range values on blur" description), the validation/revert never fires and the model observes the bad value as accepted. The same applies to `ax_desktop_click` when clicking a save/submit: the field the model just filled was the document's focused element, so clicking a button blurs the field — that path works — but isolated `ax_desktop_fill` chains do not.
**Impact:** A model that fills a NumberInput with an out-of-range value and then immediately reads state will see the bad value committed; the on-screen revert never happens. This silently masks a class of validation regressions the user is trying to surface.
**Fix:** After setting the value and dispatching `input`/`change` in `fill`, also dispatch `blur` on the element: `element.dispatchEvent(new FocusEvent("blur", { bubbles: false }))` and then refocus only if the caller passes an opt-in flag (default off to avoid double-validation in users that already manage blur). For `click`, dispatch `blur` on `document.activeElement` first if it differs from the click target.
**Regression case:**
1. Render `<input type="text" aria-label="Port" data-out-of-range="22" />` where React's `onBlur` reads `e.target.value` and, if it is outside `min/max`, calls `e.target.value = ""`.
3. Make sure no other field is focused (`document.activeElement === document.body`).
4. `ax_desktop_fill({ ref, value: "9999" })` → **expect:** field is cleared on the next `get_ui_state` read (or the state assertion shows the onBlur ran). **Currently:** value stays as `"9999"`.

---

### [MEDIUM] — `<select>` and `<option>` interaction is unreliable; only `<select>` click is admitted, and it does not select

**Category:** Correctness
**Location:** `desktopUiWebmcp.ts`, `CONTROL_SELECTOR` (now includes `[role="option"]`) and the `ax_desktop_click` `execute` body.
**Description:** The selector now lists `[role="option"]` and `[role="menuitem*"]`, so options are enumerated. But `ax_desktop_click` does not gate `<select>` / `<option>`:
- Calling `element.click()` on a native `<select>` only opens the OS picker. The picker is rendered in browser chrome (often shadow DOM, sometimes out-of-process) so its options are not the `[role="option"]` elements enumerated here.
- Calling `element.click()` on a `<option>` is browser-dependent. Chromium fires `change` on the parent `<select>`, but Safari historically does not.
- A native `<select multiple>` is partially addressable by clicking `<option>`s (Chromium-only).
ARIA `combobox`/`listbox` patterns (the `[role="combobox"]` selector) are also enumerated, but clicking them opens the popup; closing and selecting typically requires `keydown ArrowDown` / `Enter` on the active descendant, not a synthetic click.
**Impact:** Settings with selects (theme, language, interval units, etc.) appear enumerable but no input path actually selects a value. The model will report "click succeeded, UI snapshot unchanged" forever.
**Fix:**
- For `<select>` and `[role="combobox"]`, dispatch the keyboard chain `ArrowDown` / `Enter` rather than `click`, falling back to `click` only on `<select multiple>`.
- For `<option>` and `[role="option"]`, dispatch a `mousedown` + `mouseup` + `click` triplet (React listens on `mousedown` for option selection in some libraries) and immediately read back `element.selected` / `aria-selected`.
- For native `<select>` without `multiple`, refuse with "Native picker is not addressable; the host must use an ARIA combobox". This is honest guidance for the model.
**Regression case:**
1. Render `<label>Theme<select aria-label="Theme"><option>A</option><option>B</option></select></label>`.
2. `ax_desktop_get_ui_state` → returns two controls: role `combobox` (the select) and two role `option` entries.
3. `ax_desktop_click({ ref: optionB })` → **expect:** subsequent `get_ui_state` shows `selected: "true"` on the option; **currently:** no `change` fires, `selected` stays `null`.

---

### [LOW] — `compact` truncation can mask label/role changes and invalidate the stale-ref guard

**Category:** Correctness / Accessibility
**Location:** `desktopUiWebmcp.ts`, the `compact` helper at the top of the file and both call sites in `nameOf`/`snapshot`.
**Description:** `compact` slices to 160 chars. Two controls whose accessible names share the same 160-char prefix but differ in their tails (e.g., a long error message that re-renders with a different code) will produce identical `name` strings. The `resolve` function then sees `name !== nameOf(element)` as `false` and proceeds, even though the underlying element has changed. Same hazard for `role`, though that path uses `tagName.toLowerCase()` and is unaffected unless the role attribute is set.
**Impact:** A `click` or `fill` on a ref whose label changed silently but in the >160-char tail will fire on the new (semantically different) control instead of being rejected with "Control changed; read the UI again". In the dev-testing context, this can produce false-positive passes.
**Fix:** Either widen the slice (e.g., 1024 chars — still bounded) or hash the full text into a separate `nameHash` field on each control and compare hashes in `resolve` in addition to (or instead of) the truncated `name`. The hash keeps the surface small and avoids leaking full labels.
**Regression case:**
1. Snapshot returns control with `name` truncated at 160 chars.
2. Programmatically change the label so the first 160 chars match but chars 161+ differ.
3. Call `ax_desktop_click({ ref })` → **expect:** throws "Control changed; read the UI again". **Currently:** proceeds and clicks the changed control.

---

### [LOW] — Hooks type guard validates `trusted` but the caller cannot observe it

**Category:** Correctness (settings response handling)
**Location:** `desktop/packages/ui/src/components/sections/hooks/hooksLoad.ts`, `isHookWorkspace` and `fetchHookWorkspace`.
**Description:** The guard enforces `typeof value.trusted === "boolean"` but the returned `HookWorkspace` is opaque to UI code that needs to render a "trusted" badge, gate destructive actions, or filter hooks by trust level. Currently every consumer sees a single uniform list.
**Impact:** The UI cannot reflect trust state, so users cannot tell which hooks are sandboxed vs trusted, and the audit/UX goal of the trust flag is unmet.
**Fix:** Either surface `trusted` on the returned object (return `{ ...result.data }` explicitly typed, or wrap into a small struct `{ trusted, workspace: result.data }`) and update `fetchHookWorkspace`'s return type. Alternatively, fold `trusted` into a top-level field that the React component reads and renders.
**Regression case:**
1. Mock `axCodeClient.getScopedSdkClient(...).hooks.get` to resolve `{ data: { trusted: false, file: { path: "/p", exists: true, valid: true }, hooks: [], packs: [] } }`.
2. Call `fetchHookWorkspace("/p")`.
3. **Expect:** caller can read `.trusted === false`. **Currently:** `trusted` is unrecoverable; the function returns `HookWorkspace` directly.

---

## Scoped visual usability improvement (settings forms)

**Suggestion: Persistent, always-visible row labels for the 33 Shortcuts capture fields, paired with a captured-combo readout.**

Grounded in the evidence: "Shortcuts has 33 read-only capture fields and 33 Save/Reset button pairs" and the surrounding complaint about "unlabeled numeric fields and icon buttons". The current row apparently relies on placeholder / tooltip to convey the captured binding, which is invisible by default and a11y-hostile. Two specific, scoped moves:

1. Each capture row should render a left-anchored, non-truncating label that names the action (e.g., "Toggle Command Palette", "Open Settings") above or beside the capture field, with the captured key chord ("Cmd + Shift + P") shown as a static, read-only monospace chip *inside* the row. Today the field is "read-only" but its name is not on screen.
2. The 33 Save / Reset button pairs should be grouped per row, not floated at the end of the page. A user currently cannot tell which Save corresponds to which row without re-reading the page DOM. Anchor each pair visually to its row (a right-aligned action cluster, or a sticky footer that follows the focused row).

This is small (one row component, one CSS class, no schema change) and directly addresses the labeled-control audit the user is running. It also makes the WebMCP enumeration meaningful — `nameOf` will pick up the persistent label without needing an `aria-label` workaround, and `name` in `get_ui_state` will stop returning the placeholder-or-empty fallback that produced the "unlabeled" finding in the first place.