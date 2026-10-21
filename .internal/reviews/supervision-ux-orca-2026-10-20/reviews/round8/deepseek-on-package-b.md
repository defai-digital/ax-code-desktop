Read the PRD/VERIFY boundaries, the five files, and the new tests. Findings below (English, read-only; no files modified).

## Findings

**1. HIGH — the new catalog keys do not exist; labels render as raw keys and typecheck fails**
`desktop/packages/ui/src/components/chat/PermissionCard.tsx:408,415-416,424,432,434,441`; `ToolPart-impl.tsx:1667,214,217,219`.
`t` is typed `(key: I18nKey)`, `I18nKey = keyof typeof dict` (`messages/en.ts:3508`), and none of `chat.permissionCard.webmcp.element|how|submit|doesNotSubmit|text|textRedacted|argumentsMissing`, `chat.toolPart.webmcp.failed`, `chat.toolPart.webmcp.argumentsMissing` exists anywhere under `lib/i18n/` (verified repo-wide; `i18n-additions-b8.json` is also absent). `formatMessage` falls back to `dictionary[key] ?? enDict[key] ?? key`, so the card prints `chat.permissionCard.webmcp.element` and the collapsed row prints `chat.toolPart.webmcp.failed` instead of "Failed". `toolHelpers.webmcp.test.ts:71` reads `dict[...]` directly, which is `undefined`. The author's "type-check passed / 4222 passed" cannot hold for this tree; the en.ts edit was lost.
Fix: land the eight English keys in `en.ts` (and the locale catalogs before release), then rerun typecheck and the four new tests.

**2. HIGH — secrets are shown because redaction is value-shape only**
`toolHelpers.ts:220,279-293,405`; `PermissionCard.tsx:434,445-447`.
The keyword pattern requires `\S{8,}`, so `text: "password=hunter2"` (7 chars) is not redacted; `redactJsonValue` never looks at key names, so `arguments: { password: "hunter2" }` renders `"password": "hunter2"` on the card and in `formatToolInput`. An act typing a short password into a field named `Password` also renders in clear. This contradicts CS-27's "redacted text".
Fix: redact by sensitive key/element name (reuse the `password|secret|token|…` field test at `desktopUiWebMcp.ts:57`) and remove the 8-character floor.

**3. MEDIUM — a timed-out/cancelled WebMCP call is shown as success while collapsed**
`ToolPart-impl.tsx:1024-1025`; `toolHelpers.ts:379-382`.
`timeout`, `cancelled` and `aborted` are final states (`:1017-1022`), but `isError` excludes them and `desktopWebMcpResultFailed` returns false for any status other than completed/error/failed. Such a row gets `data-webmcp-outcome="ok"` and no "Failed" label, so a timeout looks like a normal completed call.
Fix: treat `timeout`/`cancelled`/`aborted` as failed for WebMCP rows.

**4. LOW (candidate) — WebMCP detection skips the normalizer used for tool names**
`PermissionCard.tsx:187-195` compares the raw permission name, while the transcript uses `normalizeToolName` (`toolRenderUtils.ts:38-49`, strips `server.` and `:N`). A permission reported as `webmcp:0` / `mcp.webmcp` would take the generic branch: unredacted `JSON.stringify(metadata)` plus the unscoped "Always allow". Not seen in fixtures; needs a runtime sample.

## Checked clean
Exact `webmcp`/`desktop_webmcp` names do hide both Always buttons and leave Allow once/Deny; bash still offers Always; no keyboard or auto-reply path exists in these files; titles are null-safe on malformed/absent metadata; other tool rows are unaffected because `StaticToolRow` is untouched; expanded content mounts lazily, so no performance regression observed.

One note: `canSaveWebMcpApproval` now also requires a non-empty `always`, so "Always allow on this site" is unreachable when bridge asks carry no `always` (PermissionCard.tsx:196-200) — confirm that removal is intended.
## Disposition (Claude)

1. HIGH, not a defect in the merged tree: the review ran before the package's English strings were added to `en.ts`
   (they were held back while another package edited that file). All nine keys are present and translated; typecheck passes.
2. HIGH, fixed: values under sensitive key names (password, token, api key, cookie, session, OTP and similar) are redacted at any
   depth; a credential keyword followed by any value, however short, is redacted; text typed into a field whose name or kind is
   sensitive is never shown. Tests added.
3. MEDIUM, fixed: `timeout`, `cancelled`/`canceled` and `aborted` are failures for collapsed WebMCP rows. Test added.
4. LOW, fixed together with the note: the "no standing grant" rule now applies to the built-in project browser only
   (`desktop_webmcp`, or `webmcp` with `desktopProvider`, prefixed names included). The package had also removed the Chrome
   bridge's "Always allow on this site", whose scope is a named site-allowlist record; that regression is reverted and covered by
   the updated test.
