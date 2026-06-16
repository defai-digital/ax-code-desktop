# Minisign release signing

This project publishes detached minisign signatures for GitHub Release assets.
The release workflow signs assets before the draft release is published, and
manual downloads can be verified against the pinned AX Code Desktop release
public key.

Pinned public key:

```text
RWS+dNbWPLZ6W9TH486c9zdH84NiiuFnm4VpVTRlXoMHClyQx/fY7W2A
```

The signing key lives outside the repository in `~/signkey` by default for
local recovery workflows. In CI, the secret key is provided through GitHub
Actions secrets.

## Key files

Default paths:

```text
~/signkey/ax-code-desktop.minisign.key
~/signkey/ax-code-desktop.minisign.pub
```

The secret key must never be committed, logged, or uploaded as a release asset.
The public key is safe to publish so users can verify downloaded artifacts.
`scripts/minisign-artifacts.sh` refuses to sign or verify with a public key that
does not match the pinned release key.

## Generate the keypair

Run this from the repository root:

```bash
bun run sign:keygen
```

`minisign` prompts for a password and writes the keypair to `~/signkey`.
The script sets the directory to mode `700`, the secret key to `600`, and the
public key to `644`.

For production release signing, the generated public key must match the pinned
key above. If you intentionally rotate the release key, update the pinned key in
`scripts/minisign-artifacts.sh`, `.github/workflows/release.yml`, `README.md`,
and this document in the same change that updates the GitHub Actions secret.

To use a different directory:

```bash
bun run sign:keygen -- --key-dir /path/to/signkey
```

An unencrypted key can be generated with `--no-password`, but that should only
be used for short-lived local testing keys. Prefer the explicit alias
`--allow-unencrypted-test-key` so the intent is clear in command history.

## Sign release artifacts

After building or packaging the app locally, run:

```bash
bun run release:sign
```

With no file arguments, the script signs conventional release outputs under
`packages/electron/dist` and `packages/web`. It creates one `<artifact>.minisig`
file per artifact and verifies each signature against the pinned public key.

The script refuses to overwrite an existing `.minisig` file. Use `--force` only
when you intentionally want to replace signatures after rebuilding or rotating
the key.

To sign explicit files:

```bash
bun run release:sign -- packages/electron/dist/AX.Code.Desktop-0.8.0-arm64.dmg
```

To use a different key directory:

```bash
bun run release:sign -- --key-dir /path/to/signkey
```

By default, each trusted minisign comment includes the artifact basename,
SHA-256 hash, and UTC signing timestamp. Override it only when a release process
needs a fixed trusted comment:

```bash
bun run release:sign -- --trusted-comment "AX Code Desktop 0.8.0 release"
```

## Verify an artifact

Users can verify a downloaded artifact with the pinned public key:

```bash
minisign -V \
  -P RWS+dNbWPLZ6W9TH486c9zdH84NiiuFnm4VpVTRlXoMHClyQx/fY7W2A \
  -m packages/electron/dist/AX.Code.Desktop-0.8.0-arm64.dmg \
  -x packages/electron/dist/AX.Code.Desktop-0.8.0-arm64.dmg.minisig
```

## GitHub Actions secrets

The release workflow requires these repository secrets before a release can be
published:

```text
AX_CODE_DESKTOP_MINISIGN_SECRET_KEY_B64
AX_CODE_DESKTOP_MINISIGN_PASSWORD
```

`AX_CODE_DESKTOP_MINISIGN_SECRET_KEY_B64` is the base64-encoded minisign secret
key file that matches the pinned public key. `AX_CODE_DESKTOP_MINISIGN_PASSWORD`
unlocks that key during the signing job.

## macOS Keychain for local signing

For local release recovery on macOS, keep the encrypted minisign secret key on
disk with mode `600` and store only its passphrase in Apple Keychain:

```bash
security add-generic-password -U \
  -a ax-code-desktop-release \
  -s ax-code-desktop-minisign \
  -w
```

`scripts/minisign-artifacts.sh` reads that Keychain item automatically when
`AX_CODE_DESKTOP_MINISIGN_PASSWORD` and `MINISIGN_PASSWORD` are not set. You can
override the lookup names with:

```text
AX_CODE_DESKTOP_MINISIGN_KEYCHAIN_SERVICE
AX_CODE_DESKTOP_MINISIGN_KEYCHAIN_ACCOUNT
```

This minisign signature is separate from platform code signing and notarization.
It proves artifact integrity against the published minisign public key; it does
not replace Apple Developer ID, Windows Authenticode, or Electron auto-update
metadata.
