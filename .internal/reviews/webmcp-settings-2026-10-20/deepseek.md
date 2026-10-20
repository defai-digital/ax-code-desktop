## Scope

Reviewed as supplied (no tools, no execution): `desktopUiWebMcp.ts` and `hooksLoad.ts`. Line numbers are omitted because the pasted source has none; anchors are function/predicate names.

---

### [SEVERITY: MEDIUM] — Text-like inputs other than `text`/`search` are neither fillable nor clickable

**Location:** `desktop/packages/ui/src/lib/desktopUiWebMcp.ts` — `fillable()` (the `!["text","search"].includes(element.type)` guard) and `ax_desktop_click.execute` (the `!["button","submit","reset","checkbox","radio"].includes(element.type)` guard)
**Category:** Dev-test surface correctness (functional gap, not a remote vuln)
**Description:** The two guards form a closed union. `click` refuses every input whose type is not button/submit/reset/checkbox/radio ("Use fill for text fields"), and `fill` refuses every input whose type is not `text`/`search`. The intersection leaves `number`, `email`, `url`, `tel`, `date`, `time`, `datetime-local`, `month`, `week`, `range`, and `color` with **no legal action at all**.
**Impact:** Directly undercuts the change you are shipping. The `NumberInput` out-of-range-on-blur path is only reachable if the field can be filled; if `NumberInput` renders `type="number"`, `fill` throws "Field is not available for filling" and `click` throws "…other input types are unavailable". The same applies to any server-URL / port / email field across the 15 settings pages. The model sees the control in the snapshot with `fillable: false`, has no action to try, and will typically report the setting as unreachable or absent — a silent test blind spot rather than a loud failure.
Secondary defect in the same predicate: `fillable()` checks `readOnly`/`disabled` but not `aria-disabled`, while `resolve()` does. A text input with `aria-disabled="true"` is therefore emitted as `{ disabled: true, fillable: true }` by `snapshot()`, and a subsequent `fill` throws "Control is disabled" — contradictory metadata the model cannot reason about.
**Fix:**
- Replace the `fill` allowlist with an explicit text-entry set (`text, search, number, email, url, tel, date, time, datetime-local, month, week`), keeping `password`, `file`, `hidden`, `color`, `range` excluded.
- In `click`, for an `HTMLInputElement` that is text-entry, focus it instead of throwing; keep the throw for button/checkbox/radio only as "use click", and reserve "use fill" for the genuinely non-clickable case.
- In `snapshot()`, compute `fillable: fillable(element) && !disabled` so `disabled` and `fillable` can never both be true.

**Regression cases:**
1. `<input type="number" id="port" aria-label="Port">` → snapshot `fillable:true`; `fill {"ref":…,"value":"70000"}` → performed; after blur the out-of-range error is observable.
2. `<input type="email" aria-label="Notification address">` → `fill` succeeds; `click` does not throw.
3. `<input type="text" aria-label="Token limit" aria-disabled="true">` → snapshot `{disabled:true, fillable:false}` (currently `fillable:true`).
4. `<input type="password" aria-label="Admin password">` → `fill` still rejected (no regression on the credential exclusion).
5. `<input type="file">` → rejected by both paths.

---

### [SEVERITY: MEDIUM] — Native `<select>` is a dead control; `<option>` is still absent from the selector

**Location:** `desktop/packages/ui/src/lib/desktopUiWebMcp.ts` — `CONTROL_SELECTOR`, `ax_desktop_click.execute`, `fillable()`
**Category:** Dev-test surface correctness
**Description:** The selector fix added `[role="option"]`, `[role="menuitem"]`, `[role="menuitemcheckbox"]`, `[role="menuitemradio"]`, so ARIA menu/listbox patterns are now addressable. But:
- bare `<option>` is still not in `CONTROL_SELECTOR`, so native-select choices never appear;
- `select` *is* matched, and `click` permits it (it is neither `HTMLInputElement` nor `HTMLTextAreaElement`), but `element.click()` on a `<select>` does not open the popup or commit a value;
- `fillable()` rejects it (input/textarea only), so `fill` throws.
The result is a control that appears actionable in the snapshot and is inert in practice.
**Impact:** Any settings page using a native `<select>` (theme, log level, provider, model picker if not a custom listbox) cannot be exercised. Worse, because the tool never echoes values, the model gets `performed: true` from `click` plus an unchanged snapshot and can loop or falsely conclude the value was set.
**Fix:** Pick one deliberately:
- (a) implement selection: include `option` in the selector as `role: "option"`, and in `fill`/a dedicated pick, set `select.selectedIndex` and dispatch `input`+`change`;
- (b) if selection is out of scope, drop `select` from the snapshot (or emit `unsupported: true`) and say so in the tool description so the model does not retry.

Separately, document that `[role="option"]`/`[role="menuitem"]` normally mount only while the parent combobox/menu is open, so the workflow is click-the-trigger → re-snapshot → click-the-item. With the current description ("Click a rendered control…") the model will not know why the options are missing on the first snapshot.

**Regression cases:**
1. Native `<select aria-label="Theme"><option>light</option><option>dark</option></select>` → either the two options are individually addressable and selecting works, or the control is not advertised at all. Not "advertised, clickable, no effect".
2. `<button aria-haspopup="listbox">` → `[role="option"]` absent from snapshot #1; after click, present in snapshot #2 and clickable.
3. `[role="menuitem"]` inside a closed menu → not in snapshot; after opening, present and click succeeds.

---

### [SEVERITY: LOW-MEDIUM] — Hooks guard rejects explicitly-`null` optional fields, so a valid payload becomes "Invalid hooks response"

**Location:** `desktop/packages/ui/src/components/sections/hooks/hooksLoad.ts` — `isHookWorkspace`
**Category:** Malformed-settings-response handling (over-strict validation)
**Description:** The `{}` crash is genuinely fixed — `typeof value.trusted !== "boolean"` short-circuits `{}`, `null`, arrays, and partial objects before any property access. But the optional-field checks use `undefined` as the only "absent" sentinel:
- `value.file.error !== undefined && typeof value.file.error !== "string"`
- `["matcher","pack","protocol"].every(key => entry[key] === undefined || typeof entry[key] === "string")`
- `pack.description === undefined || typeof pack.description === "string"`

Any backend that serializes optional fields as explicit `null` (very common for Rust/serde `Option<T>` and for JSON built from a struct with `Default`) produces `{ file: { path, exists, valid, error: null } }`, which fails all three checks and surfaces the whole Hooks page as "Invalid hooks response" even though the data is well-formed and renderable.
**Impact:** A false-negative that is harder to diagnose than the original crash: the page shows a generic error with no field name, and the failure only appears for servers/serializers that emit `null` (so it will pass CI against a stub that omits keys and fail against a real runtime).
**Fix:** Treat `null` as absent: `value.file.error == null || typeof value.file.error === "string"`, and equivalently for `matcher`/`pack`/`protocol`/`description`. Optionally include the failing key in the error ("Invalid hooks response: file.error") so the failure is diagnosable.
**Regression cases:**
1. `{trusted:true, file:{path:"/p/.hooks.json", exists:false, valid:true, error:null}, hooks:[], packs:[]}` → accepted (currently rejected).
2. `{…same, hooks:[{event:"pre", command:"x", source:"project", matcher:null}]}` → accepted.
3. `{…same, file:{…, error: 42}}` → rejected with a message naming `file.error`.
4. `{}`, `[]`, `null`, `{trusted:"yes"}` → rejected before any property access (no regression).
5. `{trusted:true, file:{…}, hooks:[null], packs:[]}` → rejected (no crash).

---

### [SEVERITY: LOW-MEDIUM] — `nameOf()` is not accessible-name computation, so the a11y audit it feeds is wrong in both directions

**Location:** `desktop/packages/ui/src/lib/desktopUiWebMcp.ts` — `nameOf()`
**Category:** Accessibility (false negatives / false positives in the audit surface)
**Description:** For inputs/textareas the order is `aria-labelledby → aria-label → labels → placeholder → title`, and `placeholder` is returned indistinguishably from a real label. This is precisely the defect class you are auditing ("three unlabeled text inputs"): a field whose only human-visible text is a placeholder is *unlabelled in the accessibility tree* but is reported here as named, so the inspection tool certifies it as fine. In the other direction, `value` is ignored for `<input type="submit" value="Save">` and `alt` is ignored for `<img alt="Close">` inside a button — both legitimately named controls are reported with `name: ""`, i.e. false "unnamed icon button" findings.
**Impact:** The tool is the evidence source for the 15-page a11y audit, so its name resolution determines whether unlabeled fields are found or missed. It also affects `resolve()`: the staleness check compares `nameOf(element)`, and two controls that collapse to the same placeholder-derived name make refs interchangeable in intent.
**Fix:** Follow the accname steps: `aria-labelledby → aria-label → associated label → alt (img) → value (submit/reset/button) → title → placeholder`, and return a provenance marker so the snapshot can say `nameSource: "placeholder"` or `unlabeled: true`. Keep `placeholder` last and never present it as a label.
**Regression cases:**
1. `<input id="a"><label for="a">Base URL</label>` → `name:"Base URL"`, `nameSource:"label"`.
2. `<input placeholder="Search settings">` with no label → `nameSource:"placeholder"`, `unlabeled:true` (currently indistinguishable from case 1).
3. `<button><img alt="Close"></button>` → `name:"Close"` (currently `""`).
4. `<input type="submit" value="Save">` → `name:"Save"` (currently `""`).
5. `<button title="More options"></button>` → `name:"More options"`, `nameSource:"title"`.

---

### [SEVERITY: LOW] — Every action resets paging to offset 0, which makes deep controls (Shortcuts Save/Reset pairs) impractical to drive

**Location:** `desktop/packages/ui/src/lib/desktopUiWebMcp.ts` — `ax_desktop_click` / `ax_desktop_fill` return `ui: snapshot()`; `snapshot()` always clears `targets` and starts at `offset = 0`
**Category:** Dev-test workflow correctness
**Description:** The 100-control cap itself is a documented, acceptable limit — `offset`, `total`, `nextOffset`, and `truncated` are consistent and the description tells the caller to chain `nextOffset`. The actionable defect is that `click`/`fill` accept no `offset` and always return page 0. Shortcuts has 33 capture fields + 33 Save/Reset pairs (≈99 controls) before any nav/chrome, so acting on a pair near the end means: page forward, click, get page 0 back, page forward again. Any single mis-step costs a full re-walk. Secondarily, `offset` is not required to be page-aligned, so `offset: 50` silently skips controls 0–49 while still reporting `total`, with no flag that a gap occurred.
**Impact:** Reliability, not security: multi-step flows on the densest page will burn turns, and a model that loses its place can act on a same-named control from the wrong page. `element.focus({preventScroll:true})` before `click()` does correctly make blur-based validation fire on the *next* action, but there is still no way to trigger blur without mutating something.
**Fix:** Accept an optional validated `offset` on `click`/`fill` and pass it to the trailing `snapshot(offset)` so the caller keeps its page; or anchor on the acted-upon element's index and return the page containing it. Either reject non-aligned offsets (`offset % MAX_CONTROLS !== 0`) or report `skipped: offset % MAX_CONTROLS`.
**Regression cases:**
1. `get_ui_state {offset:100}` → click `ref` from that page → returned `ui.offset === 100`, not 0.
2. Shortcuts page with `total: 112`: `nextOffset` is exactly `100`, second page has 12 controls, `truncated:false`.
3. `get_ui_state {offset: 50}` → either rejected as unaligned or reports the 50 skipped controls.
4. Fill a text field, then immediately read state without any other action → the field's validation state is unchanged (documents that blur requires a follow-up action).

---

## Real bugs vs. documented dev-only limits

**Documented limits — not defects (I agree with them as designed):** the 100-control page size with explicit `nextOffset` chaining; the opt-in gate on `__AX_CODE_DESKTOP_ELECTRON__.uiWebMcpEnabled` plus `win.top === win` and `isSecureContext`; the absence of any JS/selector/IPC escape hatch; refs expiring on the next snapshot or action; no value echoing and no chat-content extraction; unpackaged-only, temporary-profile, stub-runtime launcher. `readOnlyHint` is set correctly (`true` only for `get_ui_state`). `dispose()` is effectively idempotent (double abort / double `removeEventListener` are no-ops), and the `pagehide`-before-registration ordering correctly cleans up a partial registration failure.

**Real remaining bugs:** findings 1–5 above; 1 and 2 block dev-testing of whole control classes, 3 turns a valid Hooks payload into an error state, 4 corrupts the a11y audit evidence itself, 5 is workflow friction.

**Considered, not reported as findings** (low confidence or low blast radius): the `fillable()` credential denylist is name-based (`/password|secret|token|credential|api.?key|credit|card|cc-|one-time-code/`), so an `<input type="text" aria-label="Anthropic key">` is fillable — the risk is bounded because values are never echoed and there is no outbound path, and `type="password"` is excluded structurally; the staleness check re-derives `nameOf` on each `resolve()` (a re-render that produces an identical name+role on a *new but connected* node would be accepted, but that is usually the desired behaviour); `headings` uses raw `textContent` and could pick up dynamic content if a product view ever renders chat text in an `h2`.

---

## One scoped visual usability improvement (settings forms)

**Replace the per-row button pair with a single persistent field row: label left, control right, inline committed/invalid state beneath, and Save/Reset disabled until the row is dirty.**

Grounding in the supplied evidence:
- `NumberInput` commits **on blur**, so the only moment a value is validated is when focus leaves — a tester who fills and reads the snapshot sees no feedback. A persistent state line ("Saved", "Out of range: 1–65535") makes validation observable without needing a blur, which the WebMCP tool cannot reliably trigger on its own.
- Shortcuts currently renders **33 capture fields and 33 Save/Reset pairs** = 66 visually identical buttons with duplicate generic labels. Disabling both buttons until the row is dirty turns 66 always-active targets into ~66 quiet ones plus one obvious action per changed row, and removes most duplicate accessible names by construction.
- The three unlabeled text inputs and the duplicate generic Increase/Decrease labels are name problems that a visible label-above/left layout fixes at the source rather than papering over with `aria-label` — and it makes `nameOf()`'s label path the primary path, so the inspection tool stops depending on placeholder fallbacks.

Concretely, one row: visible `<label for>` text, the control, a `role="status"` line for committed/error state, and `Save`/`Reset` disabled when `value === committedValue`. That is one layout component applied to all 15 pages, not a redesign.