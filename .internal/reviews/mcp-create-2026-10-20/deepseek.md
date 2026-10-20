## Concrete defects (from excerpt; unverified against full file)

1. **`isNewServer` is name-derived, not identity-derived.** `mcpDraft.name === selectedMcpNameKey` collapses when a renamed draft reaches a name that already exists (or when selection follows the rename). The `else` branch then loads from inventory and repopulates URL/env/secret, which is exactly the reported loss. The fix should key "new" on draft identity (`selectedMcpNameKey === draftId`), not on a mutable name.

2. **`loadedDraftRef` keyed on draft object identity is fragile.** If the draft is a derived/memo object it changes per render, cache misses, and the effect repopulates all fields from the draft — clobbering unsaved edits with pre-edit draft values. Conversely, if the draft is stable but its contents were updated by an older save attempt, the cache *hides* the update. Identity is not a version.

3. **`initialRef` is written from render-scope closure variables, not the submitted snapshot.** The stated invariant ("baseline = submitted, current fields stay dirty") only holds if those closures are the submitted render. That is not visible here and is the most likely silent regression: edit-during-save may produce either a wrong dirty flag or a false-clean form.

4. **`setIsSaving(true)` in the load branch of the same effect.** Selecting an existing server disables name/scope as though a save were in flight, and only a submit path clears it. If `isNewServer` flips during a failed save, name/scope can remain disabled with no request in flight.

5. **`clearPendingMcpAuthContext` runs before the generation check.** On stale completion it mutates auth state for a form the user has left — a partial commit outside the generation guard.

6. **Secret repopulation.** `setOauthClientSecret(mcpDraft.oauthClientSecret)` on any cache miss can re-inject a user-cleared secret after handoff.

## Missing causal tests

- Rename draft onto an existing inventory name, then refresh.
- Draft identity churn (derived draft) with an in-flight edit.
- Baseline exactness: assert `initialRef` equals submitted values *and* the field equals the post-save edit, separately.
- Directory formatting variants (`""` vs `null` vs trailing slash) in the `name|dir` key.
- Failed save followed by retry, with URL edited between attempts.
- Generation change during `clearPendingMcpAuthContext`.
- `isSaving` release on the load branch and on `!result.ok`.
- A red test asserting URL value at the moment inventory publishes, not after settling.

## UX

Form can show a newer URL under a success toast with only a dirty marker as the cue — add explicit "saved earlier version; unsaved edits" copy. Draft still labelled new while inventory already lists the server risks duplicate rows in the sidebar; selection jump to created name can steal focus mid-typing. Name/scope flicker-disabled on selection is visible as a stutter.
