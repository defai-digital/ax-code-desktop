## Final answer — ADR-266 review (read-only, no files modified)

**Verdict: no blocking issue.** The security-relevant claims in the author's report hold:

- `reason`/`nextAction` are constants supplied by the runtime; the caught message is never copied (`desktop_webmcp.ts:43-48`), so input values cannot ride into failure metadata.
- `ctx.metadata` records only `operation`, `reason`, `nextAction`, `path` (`desktop_webmcp.ts:82-90`).
- Schema validation happens before `ctx.ask`, and an uncheckable schema fails closed.
- `always` remains `[]`; no standing grant or new auto-approval was introduced.
- The preview is built from `invocation.input` — the same detached object handed to `DesktopBrowser.invoke` — so preview and payload cannot diverge.
- Enrollment is enforced inside `enroll`, not only in the route, and `Filesystem.resolve` handles `..`, symlinks, win32 casing, `/cygdrive`/`/mnt` drive forms; failures are fail-closed.

### [MEDIUM] Preview truncation is silent
`desktop-browser.ts:819-824`, metadata at `desktop_webmcp.ts:227`. Input may be 64 KiB; the preview is cut at 2048 bytes with no marker. ADR text says the preview "is exactly what will be sent", but everything past byte 2048 is invisible at approval. **Fix:** append `… (${total} bytes, ${dropped} not shown)` or add `previewTruncated`/`previewBytes`, and correct the ADR wording.

### [MEDIUM] Ajv compiles untrusted schema on every invoke
`desktop-browser.ts:866-872`. `validateSchema:false` admits exotic shapes; a fresh Ajv is constructed per call, and `prepareInvocation` runs twice per invoke (`:215` and inside the approval callback `:235`). A page schema with `pattern:"^(a+)+$"` plus a long agent argument is ReDoS on the event loop; there is no compile/validate budget. **Fix:** cache the compiled validator per digest (bounded LRU, invalidated on `update`), reuse it in the callback, and cap or reject `pattern`.

### [MEDIUM] Exact-directory enrollment rejects moved same-project sessions
`desktop-browser.ts:413-419, 427`. `SessionMove` intentionally allows moving a session to a subdirectory or sandbox root inside the project boundary (`session/move.ts:80-82`), but enrollment now requires `realpath(info.directory) === realpath(Instance.directory)`, so a moved session can no longer enroll a browser even though `requireCurrentProjectSession` would accept it. **Fix:** accept contained directories for the same `projectID`, or document the limitation and return a nextAction that says to move the session back.

### [LOW] Redaction misses concatenated / non-ASCII secret tokens
`desktop-browser.ts:826-834`. `accesstoken`, `clientsecret`, `bearertoken`, `pässword` are not redacted, while `sessionKey`, `api_key`, `X-Api-Key` are. Value-level secrets under innocuous keys (`note: "sk-…"`, plain passwords) are shown; only JWT/bearer shapes are pre-rejected (`:889`). **Fix:** match secret words as suffixed lowercased substrings, strip diacritics before tokenizing, and state explicitly that value-level redaction is not promised.

### [LOW] Enrollment failures classified `native-failure`
`desktop-browser.ts:125-126`. "Session belongs to another project" and the missing-session case read as a browser fault and tell the model to stop, rather than naming the renderer's bad session ID. **Fix:** distinct reason (or `no-page`) with a session-specific nextAction.

Note: I did not re-run typecheck/tests (no verification command was executed this session); conclusions are from source inspection plus the report's recorded probe results.