## Review: Mission Control activity preview — **request_changes**

Verification: typecheck pass (`9398f2c1b4b1b23d`), touched tests pass (`45eedb7615e56877`). Tests pass because the new suite never exercises the failing single-text cases.

### [MEDIUM] Credential redaction is both over- and under-inclusive — `activityPreview.ts:72–78, 85–87`
- `previewLine` returns `null` for the **whole** part if the *raw* text matches anywhere (`:72`), so `"Migration is done\n<secret line>\nmore"` drops a safe first line. Req 1 only forbids the shown line from containing secrets, and the duplicate assistant-message path (`:92–107`) already falls back to an earlier safe line — inconsistent contract.
- Conversely, detection runs **only on the first non-empty line** (`:75`); the redaction regex therefore never sees later lines. A first line that is clean leaks nothing *unless* the secret is in it — but `inProgressTodo` collapses *all* lines (`:85`) then matches the whole string, so a safe todo subject plus a secret-looking second line hits the regex only by luck of substring order and can produce a preview containing the secret.
- Fix: drop the `:72` pre-check; apply `looksLikeCredential` per collapsed line for both sources; for todos, split on lines before collapsing.
- Channel check ✓: only `part.type === "text"` (`:101`) — tool/reasoning/file/ignored parts cannot reach the preview. Regexes also miss private-key bodies, `.env` style `FOO=hex`, and passphrases; acceptable as defense-in-depth, not as a guarantee.

### [MEDIUM] `activitySliceDeps` blind to parts that precede their message — `activityPreview.ts:164–172`
Deps push `part.get(messageId)` only for assistant messages already in `message[sessionId]`. `event-reducer.ts:658–677` stores a part **before** its owning message and returns `incomplete-session-snapshot`; deps stay unchanged, so the cached null snapshot is served until `message.updated` arrives. Visible effect is a one-frame-late preview, but the memo's correctness now depends on event ordering and is untested.

### [LOW] Todo prefix baked into `text`, then stripped — `MissionControlRow.tsx:253–259`, `activityPreview.ts:7,87`
`ActivityPreview.text` means "English-prefixed content" only for `kind: "todo"`. Non-English UIs show the hardcoded prefix wherever `text` is rendered directly (tooltip, e2e snapshot, future consumers). Put content only in `text`; let the row apply the i18n template.

### [LOW] Truncation/RTL and child-exclusion coverage — `activityPreview.test.ts:51–66`
`truncateToCodeUnits` is surrogate-safe (`textTruncate.ts:9–18`) but no test straddles a pair at 139/140 or uses RTL/ZWJ. `rootActivityTargets` child exclusion and `directoryFor`'s scan-any-directory fallback (`:122–135`, can bind by session key across stores when `directory` is null) are also untested. Add: astral-emoji truncation, child gets no activity entry, part-before-message test.

**Stable parts:** row memo is reference-stable for the streaming-truncated case (verified by the new publisher test); `subscribeAll` returns a real teardown (`child-store.ts:224–230`); `showsGoalOrError` and density gating don't alter the `Open/Details/Select` accessible names; all 13 locale catalogs already contain `preview.workingOn`.

Review id `79d9e66cfd414168`. Note: the tool's recommendation reads "approve" with "0 blocking"; I overrode to request changes because the recorded MEDIUM redaction defect violates Req 1.