# Minisign release signing

This project can produce detached minisign signatures for release artifacts.
The signing key lives outside the repository in `~/signkey` by default.

## Key files

Default paths:

```text
~/signkey/ax-code-app.minisign.key
~/signkey/ax-code-app.minisign.pub
```

The secret key must never be committed, logged, or uploaded as a release asset.
The public key is safe to publish so users can verify downloaded artifacts.

## Generate the keypair

Run this from the repository root:

```bash
bun run sign:keygen
```

`minisign` prompts for a password and writes the keypair to `~/signkey`.
The script sets the directory to mode `700`, the secret key to `600`, and the
public key to `644`.

To use a different directory:

```bash
bun run sign:keygen -- --key-dir /path/to/signkey
```

An unencrypted key can be generated with `--no-password`, but that should only
be used for short-lived local testing keys. Prefer the explicit alias
`--allow-unencrypted-test-key` so the intent is clear in command history.

## Sign release artifacts

After building or packaging the app, run:

```bash
bun run release:sign
```

With no file arguments, the script signs conventional release outputs under
`packages/electron/dist` and `packages/web`. It creates one `<artifact>.minisig`
file per artifact and verifies each signature against the public key.

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
bun run release:sign -- --trusted-comment "AX Code App 0.8.0 release"
```

## Verify an artifact

Users can verify a downloaded artifact with the public key:

```bash
minisign -V \
  -p ~/signkey/ax-code-app.minisign.pub \
  -m packages/electron/dist/AX.Code.Desktop-0.8.0-arm64.dmg \
  -x packages/electron/dist/AX.Code.Desktop-0.8.0-arm64.dmg.minisig
```

This minisign signature is separate from platform code signing and notarization.
It proves artifact integrity against the published minisign public key; it does
not replace Apple Developer ID, Windows Authenticode, or Electron auto-update
metadata.
