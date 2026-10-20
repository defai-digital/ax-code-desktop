## Test Strategy

**Target:** Settings surface — WebMCP control enumeration, Hooks API response handling, NumberInput commit behavior.
**Approach:** Regression-first; each test below would have failed before one of your fixes (or fails now, pinning a known bug).

## Recommended Regression Tests

**1. Malformed Hooks API response must not crash the renderer** *(guards the highest-severity fix — the crash)*
Table-driven test feeding the response consumer malformed payloads: invalid JSON, wrong top-level type, null/missing fields, non-array where an array is expected. Assert: no uncaught exception, renderer stays mounted, safe fallback renders. Each payload shape is a row, so new shapes are one-line additions.

**2. Control enumeration is complete and labeled** *(locks in the ARIA, paging, and 33-labels fixes in one deterministic test)*
Render Settings, page through the control-list tool to exhaustion, union all pages. Assert:
- Union count equals the DOM's interactive-element count (catches silent truncation at page boundaries).
- Every control has a non-empty accessible name (catches the unlabeled shortcut inputs / icon buttons).
- ARIA comboboxes/menus expose their options/menu items (catches the missing-options fix).

**3. NumberInput rejects/clamps out-of-range values on blur** *(pins the currently-open bug; expect this red now)*
For each NumberInput: focus, type `min − 1` and `max + 1`, blur → assert the committed value is clamped or rejected, never out of range. Boundary pair: exact min/max are accepted. Write it failing first so the eventual fix can't regress silently.

*Honorable mention (contract, not bug):* assert fill is rejected on readonly shortcut inputs and click rejects text inputs — documents today's behavior so accidental "support" changes surface in review.

## Small Visual Improvement

Style the readonly shortcut inputs as visually distinct — muted background and no editability-implying focus ring. They cannot be filled, yet currently look identical to editable fields, which misleads both sighted users and tool-driven agents into attempting edits that will fail. Pure styling of existing controls; no new behavior.

Happy to implement these against your existing test framework on request.