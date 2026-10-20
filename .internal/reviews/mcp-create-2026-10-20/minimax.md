## Concrete defects

1. **isSaving never resets on failure path.** `if (result.ok)` updates `initialRef` and refreshes state, but the `else` / exception branch isn't shown. Nothing in the failed branch calls `setIsSaving(false)`. After a failed save, name and scope stay disabled until `currentDirectory`, `selectedMcpName`, or `mcpDraft` changes for an unrelated reason — silent stuck-form.
2. **`formGenerationRef` incremented in cleanup can desync the gate.** Cleanup runs before the next effect and also at unmount, so a dep change produces two increments (`+1` on cleanup, `+1` on next effect). Any handler that captures `formGenerationRef.current` between these moments sees a transient value that no awaited closure will match. Acceptable but brittle; one missed increment makes the success path skip baseline update.
3. **`setMcpDraft(null)` then `setSelectedMcp(name)` produces a brief intermediate render** where the form has no draft but selection hasn't moved. The next paint triggers the population effect with `mcpDraft === null`, falling into the not-shown inventory branch.
4. **`isNewServer = mcpDraft && mcpDraft.name === selectedMcpNameKey` routes on raw name equality.** If the server normalizes the created name (trim, case, illegal chars), `setSelectedMcp(name)` selects the unsanitized name and a later inventory refresh may not match — `isNewServer` flips to `false` and the next save becomes an `updateMcp` against a record that doesn't carry the original name.
5. **`clearPendingMcpAuthContext` is awaited before the generation-check.** If it throws, `initialRef` is never updated and `isSaving` stays true even though `createMcp` succeeded.

## Missing causal tests

1. Save returning `{ ok: false }` and a thrown exception — both must release `isSaving`.
2. Sanitized-name round trip: `createMcp` returns a different name than the draft's; selection must follow the server's name.
3. `clearPendingMcpAuthContext` rejection with successful create.
4. Unmount during in-flight save (no setState-on-unmounted, no leaked ref).
5. Validation 4xx vs network 5xx — different messaging.
6. Double-click save before `isSaving` propagates (concurrent `createMcp` calls).
7. Inventory refresh arriving *between* `setMcpDraft(null)` and `setSelectedMcp(name)`; identity cache must not interfere.
8. `inventoryMatchesDirectory === false` on first navigation into a project — form should not flash blank.
9. Headers/env edited while saving and a later transport-type change after success.

## Visual / UX implications

- No save indicator (spinner, label change, disabled-button text) is visible in the excerpt; users get feedback only via name/scope disabling.
- Failures are invisible: no toast or inline error; the form silently freezes.
- "Keep current values across handoff" means the editor shows local values even if the server normalized them — user sees accepted state that isn't actually persisted.
- Editable-while-saving helps responsiveness but creates dirty-flag ambiguity: baseline updates on success using current state, so post-success typing is immediately "dirty" against just-acknowledged data.
