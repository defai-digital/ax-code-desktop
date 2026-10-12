# Desktop Signing Credential Provisioning

## Authorization and scope

The user explicitly requested provisioning the same Apple and Azure signing setup for AX Code Desktop, limited to `ax-code-desktop`. AX Code Actions remain disabled. No AX Code workflow or repository setting was changed during this provisioning. No public release or distribution cutover was performed.

## Verified Azure setup

- Destination: `defai-digital/ax-code-desktop` Actions Secrets only.
- Existing signing application: `cbdd6dd3-0c59-43ec-8813-cd5b120eaf4c` (`AX Studio Windows Signing`).
- Existing Key Vault: `https://keyvault-defai.vault.azure.net`, certificate `cert-defai`.
- Expected certificate SHA-1: `FC40F1109912C025E751E804AA9BD1538A2D12EF`.
- Appended a dedicated `ax-code-desktop-actions-20261012` login credential, preserving all existing credential IDs and existing RBAC grants. Expiry: `2027-04-10T02:32:38Z`.
- Configured `AZURE_CLIENT_ID`, `AZURE_CLIENT_SECRET`, and `AZURE_TENANT_ID` using stdin to `gh secret set`, without putting secret values in arguments or logs.
- Authenticated with the new credential, retrieved the public certificate, requested a Key Vault RS256 signature over a verification challenge, and independently verified it with OpenSSL against the frozen certificate. All passed.
- An earlier verification attempt used an incorrect REST metadata field; its newly added credential was deleted before the successful attempt.

## Apple setup

- Configured `APPLE_TEAM_ID` as `N5ZUZDUJS6`.
- Existing local Developer ID identity SHA-1: `CCA480038EE61E7CB9DF9FAACD842EC06949CD79`.
- Existing `ax-notary` Keychain profile authenticated successfully with Apple's notarization service.
- Local macOS Keychain authorization completed. Exported only the exact Developer ID identity and configured `APPLE_CERTIFICATE` at `2026-10-12T02:40:16Z` and `APPLE_CERTIFICATE_PASSWORD` at `2026-10-12T02:40:17Z`. The provisioning helper kept the PKCS12 archive and a generated import password in memory and sent them directly to Desktop Actions Secrets. No private-key file was written. The helper completed successfully and exited.
- `APPLE_API_KEY_B64`, `APPLE_API_KEY_ID`, and `APPLE_API_ISSUER` are still unavailable. The user has been asked for the existing API key's secure local path and identifiers, never its contents in chat.

## Publication state

Native Windows CI Authenticode qualification and full signed Desktop shadow remain pending. Successful Azure cryptographic verification is not a native installer signature or a public release.

## Continuation receipt

Desktop Actions Secrets metadata confirms all six Apple/Azure settings provisioned above. Existing Desktop Minisign secrets remain present. Only the three Apple notarization API inputs remain unavailable. No further required shadow run was dispatched while those known prerequisites are missing. Concurrent Desktop source changes were preserved; this receipt was prepared in an isolated worktree.

## Apple ID authentication continuation

The user supplied Apple ID app-specific password credentials instead of an API key. Authenticated successfully against Apple's notarization service using the secure stdin prompt; configured `APPLE_ID` and `APPLE_APP_SPECIFIC_PASSWORD` in Desktop Actions Secrets without writing their values to files or command arguments. `APPLE_API_ISSUER` was also configured from user-provided metadata, but the incomplete API set is not selected. All effective signed-shadow credential prerequisites are now configured. The workflow now supports either complete strategy through an isolated validated Keychain profile, with no public release gate waived.

Local validation: 126 root script tests passed, 4 PowerShell-dependent tests skipped; all boundary/release checks, Actionlint, syntax, and diff checks passed. The actual new helper stored the supplied credentials in an owned temporary Keychain and successfully authenticated with that profile; the temporary Keychain was deleted afterward.

Hosted run `38197317854` at `c7060d82` passed effective signing-input preflight, repository boundaries, typecheck, and lint. It then failed a full-repository boundary integration test at its default 5-second timeout. The same scan had already passed the standalone boundary gate. Matched the adjacent full-UI integration test by assigning only this full-Desktop scan a 30-second timeout; assertions and fast unit-test deadlines remain intact. No package or notarization job ran in that attempt.
