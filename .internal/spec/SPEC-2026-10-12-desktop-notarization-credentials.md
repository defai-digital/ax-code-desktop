# Desktop Notarization Credentials

Status: Implemented; hosted signed qualification pending.
Related: ADR-006, ADR-011.

The user authorized the existing Apple ID app-specific password authentication strategy for Desktop notarization. Apple certificate identity, Team ID, notarization, stapling, Gatekeeper, Minisign, and release qualification remain required. This changes credential selection only, not publication policy.

## Selection and handling

Preflight and macOS packaging require the frozen Team ID and either a complete `APPLE_API_KEY_B64` / `APPLE_API_KEY_ID` / `APPLE_API_ISSUER` set or a complete `APPLE_ID` / `APPLE_APP_SPECIFIC_PASSWORD` pair. Prefer a complete API set; incomplete API metadata must not block a complete Apple ID pair. Reject multiline selected credentials.

On the macOS runner, create `desktop-shadow-notary` in the isolated signing Keychain, validating credentials with `notarytool store-credentials`. Supply the app-specific password through the secure stdin prompt, never command arguments. API keys use a mode-0600 temporary file that is removed on success and failure. Do not export credential plaintext through `GITHUB_ENV`. Export only `APPLE_KEYCHAIN_PROFILE` and `APPLE_KEYCHAIN`; Electron Builder and the DMG submission both consume that verified profile. Failure must stop packaging without exposing credential diagnostics.

## Verification

Regressions cover complete and partial credential selection, frozen identity, newline rejection, password stdin, metadata-only environment export, temporary API key cleanup, and failed credential validation. Workflow contracts enforce the Keychain path for the app and DMG. Real local authentication with the supplied Apple ID credentials succeeded before configuring Desktop Secrets. Hosted native qualification is separate and must complete before publication.
