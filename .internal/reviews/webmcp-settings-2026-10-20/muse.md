Top finding: filling a field still does not complete the blur-commit workflow for `NumberInput`, so the main validation path the focus change was meant to exercise can remain untested until some unrelated control is clicked.

## Findings

### 1. Medium — `ax_desktop_fill` never triggers blur-commit, and native number inputs are excluded entirely

In [desktopUiWebMcp.ts](/tmp/ax-desktop-webmcp-bughunt-20261020/reviews/desktop/packages/ui/src/lib/desktopUiWebMcp.ts), `fillable()` only allows `type="text"` and `type="search"`. If `NumberInput` renders a native `type="number"`, fill rejects it outright. If it renders as text, `ax_desktop_fill` focuses it, sets the value, dispatches `input`/`change`, and immediately snapshots — the field still has focus, so blur-based commit/clamp/revert never runs. Polling with `ax_desktop_get_ui_state` also does not move focus, so repeated polling shows no committed result.

Regression case: in a numeric setting with range 1–300, fill `999`, then call only `ax_desktop_get_ui_state`. Expected: the documented committed/clamped state or error becomes observable. Actual: the value stays in the uncommitted editing state until an unrelated click steals focus. Proposed direction: add an explicit end-of-edit step (for example, blur after dispatch, or a `commit`/`blur` option) before the returned snapshot, and, if native numeric fields are in scope, allow `type="number"` with a finite numeric string check.

### 2. Medium — Labelled selects are misnamed and cannot be operated

`nameOf()` only uses associated `<label>` elements for `HTMLInputElement`/`HTMLTextAreaElement`. A `<select>` falls through to `textContent`, so `<label for="m">Model</label><select id="m"><option>Alpha</option><option>Beta</option></select>` is reported with name `Alpha Beta` instead of `Model`. The selector also contains `[role="option"]` but no bare `option` element, and there is no select-value operation: fill rejects selects and click only calls `.click()`, which does not choose a value. The ARIA option fix covers opened custom listboxes, but ordinary settings dropdowns still cannot be identified reliably or changed.

Regression case: snapshot the labelled select above, then attempt to set it to `Beta` and observe the resulting change. Expected: name `Model` and a way to select `Beta` with a change event. Actual: misnamed control and no operation performs the selection. Proposed direction: use `HTMLSelectElement.labels` in `nameOf()` and add a value-checked select operation, or explicitly document selects as inspect-only.

### 3. Medium — Read-only shortcut-capture fields cannot even be focused

For the 33 Shortcuts capture fields: they are listed in snapshots, `fillable()` rejects them because they are `readOnly`, and `ax_desktop_click` rejects every input whose type is not button/submit/reset/checkbox/radio with “Use fill for text fields”. There is therefore no path to focus a capture field or reach its “listening” state. Full key capture would additionally need a keyboard operation, which is a separate intentional absence; the focus step itself is blocked only by an overbroad text-input exclusion.

Regression case: snapshot a read-only capture input, then click its ref. Expected: focus-only activation and the listening state becomes visible. Actual: the call throws before focus. Proposed direction: allow click-as-focus for `readOnly` inputs while keeping fill rejected.

### 4. Low–Medium — The credential-field exclusion is a denylist with reachable bypasses

`fillable()` tests a fixed regex against `id`, `name`, `autocomplete`, and `nameOf(element)`. For inputs, `nameOf()` returns label text when a label exists and therefore omits the placeholder, and it never considers `aria-describedby`. These all pass as fillable today: an input labelled “Authentication” with placeholder “Paste bearer token”; `name="passphrase"`; and `aria-label="Private key"` with a neutral `name`. That contradicts the stated intent to keep credential fields outside the surface. The dev-only, opt-in, write-only nature lowers impact — values are not read back — but the exclusion boundary is narrower than claimed.

Regression fixtures: assert `fillable === false` in the snapshot for the three cases above, plus `autocomplete="new-password"` on a text input. Proposed direction: classify using token-aware matching over id/name/autocomplete/aria-label/labels/placeholder/describedby text, including passphrase, private-key, bearer, recovery, and seed concepts, rather than relying on the present substring list alone.

### 5. Low — Click/fill return the first control page, losing the operator's place past control 100

Each snapshot stores only its own page in `targets`, and both click and fill return `snapshot()` with the default offset `0`. On a page with more than 100 controls — Shortcuts alone has 33 capture fields plus 33 Save/Reset pairs, before page chrome — acting on a control reached via `offset: 100` returns page one, so verification requires manually re-paging and all refs churn.

Regression case: with at least 101 controls, read `offset: 100`, click a control there, and inspect the returned `ui.offset`. Expected: the action result stays on the originating page. Actual: `offset: 0`. Proposed direction: record the source offset alongside each target and return `snapshot(sourceOffset)`.

## Not counted as bugs — documented dev-only limits

The 100-control page size itself is now handled with `offset`, `nextOffset`, and `truncated`, and the tool description documents it. Ref expiry after another snapshot or action, the 30-heading and 160-character name caps, withholding input values, and the absence of JavaScript/selector/IPC/generic-keyboard access are consistent with the stated surface. Closed native dropdown options not being individually enumerable before the select opens is a browser constraint; finding 2 concerns the select's own naming and operability, not that constraint. The main-process opt-in, unpackaged-only, temporary-profile, stub-runtime boundary is an intended mitigation, not a defect.

For [hooksLoad.ts](/tmp/ax-desktop-webmcp-bughunt-20261020/reviews/desktop/packages/ui/src/components/sections/hooks/hooksLoad.ts), the original `{}` crash is fixed: `{}` and type-malformed nested payloads fail `isHookWorkspace` and produce “Invalid hooks response”. I found no additional concrete crash in that file from the supplied evidence; unknown extra properties are tolerated, which is defensible forward compatibility without the SDK schema showing another required field.

## One scoped visual improvement for settings forms

Give every numeric setting a persistent caption slot under the control, in reserved space so nothing shifts on validation: before editing it shows the unit and range, for example “Seconds · 1–300”; after a blur-commit failure it is replaced in the same slot by a text error such as “Enter 1–300 — kept 60”, paired with an icon and border rather than color alone, and referenced by the input via `aria-describedby`. This makes the blur rule discoverable before the user leaves the field and keeps stepper buttons' contextual labels visually consistent across the 15 settings pages being audited.
