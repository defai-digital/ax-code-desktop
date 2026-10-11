# Desktop localization v1

Status: Implementation plan authorized by the user's request on 2026-10-11.
Owner: AX Coder GUI. AX Code runtime ownership and public release policy are unchanged.

## Reviewed inputs

Read-only Muse and Grok CLI reviews are retained in `.internal/reviews/localization-2026-10-11/`.
Both recommended preserving the typed translation facade, explicit plural formatting, main-owned preferences,
atomic catalog switching, and separating structural completeness from linguistic quality. The user requested
all fourteen AX Code locales; implement the complete set rather than presenting partial catalogs as complete.
Reference projects were inspected as design input only. No reference source or translation is imported.

## Contract

- Locale IDs and native names are declared in `desktop/shared/locales.json`.
- Interface preference is `system` or a supported ID. Conversation preference is `auto` or a supported ID.
- `auto` does not inject any conversation instruction; it is independent of interface language.
- Explicit preference wins over system preferred languages; an unsupported system language tries the next
  preference before English. Chinese script and Portuguese aliases are normalized using Intl locale data.
- Main persists schema-1 preferences atomically in its user-data directory, separately from the existing
  replaceable desktop settings object. Serialized updates preserve changes from concurrent windows.
- IPC accepts only preference IDs and broadcasts committed revisions. No renderer-supplied translation text
  is accepted by main. Native catalogs are packaged and available before renderer initialization.
- Renderer lazy-loads one locale, deduplicates pending requests, ignores stale revisions/completions, and
  commits dictionary and active locale together. A load failure displays English while retaining the preference.
- Initial locale loading precedes React mounting. Native recovery remains available if renderer startup fails.
- Keep `t(key, params)` literal interpolation unchanged. Add explicit plural and Intl formatting APIs.
- Translate presentation only. User content, repository names, paths, raw diagnostics, commands, evidence,
  action IDs, and verification results remain intact.
- Published SDK 2.6.7 and signed runtime 7.24.4 expose `system` on prompt and command request shapes. The GUI snapshots the conversation
  preference for each new request and adds an English preference instruction; it never mutates the original
  message or arguments. Instruction text explicitly defers to user and project language rules. `auto` omits
  the field. No runtime defaults, TUI state, credentials, provider policy, or sibling source are changed.
- Translation files use ASCII JSON escapes to honor repository file-language policy. Generated native subsets
  are checked against their source catalogs. Catalogs must load from installed assets without network access.

## Acceptance

Require exact keys, nonempty NFC strings, placeholder parity, explicit reviewed identical-string exceptions,
all fourteen locale IDs, serialized persistence, restart/corrupt-file behavior, failed-write recovery,
rapid switching, stale broadcasts, transport body preservation, native menu/dialog formatting, and layout
expansion checks. Run full typecheck, lint, tests, ownership/release boundaries, and desktop build.
The original runtime 7.10.2 omitted command system instructions. Upgrade the signed pin to published 7.24.4,
verify all five archive and signature sizes, SHA-256 digests and Minisign signatures, and qualify local request handling.
Structural checks and model review do not prove native-speaker review or signed Windows/Linux qualification.
Public release remains disabled; do not publish or push as part of this task.
