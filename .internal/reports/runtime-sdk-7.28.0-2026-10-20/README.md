# Runtime 7.28.0 and SDK 2.6.41 adoption

Date: 2026-10-20

AX Code Desktop now pins the published AX Code runtime 7.28.0 and the exact SDK 2.6.41 from GitHub Packages (ADR-022).
The runtime manifest, SDK pin, the three package manifests, the frozen lockfile and the contract tests agree. Desktop's
own version is unchanged by this record.

## Published inputs

- Release: https://github.com/defai-digital/ax-code/releases/tag/v7.28.0 (published, not a draft or prerelease, 15 assets).
- Tags `v7.28.0` and `sdk-v2.6.41` both resolve to producer commit `87e64c8d49f829a27ea2f22c18cf5a8453dd3f96`
  ("Prepare AX Code v7.28.0 and SDK v2.6.41").
- SDK: `@defai-digital/ax-code-sdk@2.6.41` on `https://npm.pkg.github.com`, dist-tag `latest`, integrity
  `sha512-jPfVnuyloCuHeWfniK13oyMKtD4sPJcOdR8g7A17VL6FZBngHwAAsJJrWxivaygvIt+wT+RIzepvIIAz7y7+KQ==`, equal to the
  lockfile entry.
- All four runtime archives were downloaded. Detached minisign signatures pass against the repository key
  (`resources/keys/ax-minisign.pub`, sha256 `41de2e31…`, byte-identical to the release's `ax-minisign.pub`), and each
  trusted comment's SHA-256 equals the computed archive SHA-256 and the value in `config/ax-code-runtime.json`.

| Target | Size | SHA-256 |
| --- | --- | --- |
| darwin-arm64 | 77069941 | `7c961391f739feb6d39ba16e5724e4308c3f09590c1f26693efbeca91b65575a` |
| linux-arm64 | 83879176 | `eac0f1fb48f19025d70ff6ccb7c205f987a9b463adf4ec985afc93db8db34129` |
| linux-x64 | 85614458 | `1a8d72d64c215a7f73eda35a1a27f9a7dfe41313aba4530a219bbaeeff8422ce` |
| win32-x64 | 91623577 | `0c08518af1aa35020376022a6cd8a1ef116337837dd93980e01422cf8e0f094c` |

The Darwin ARM64 binary reports `7.28.0`. Linux and Windows archives were verified by signature, size and digest but not
executed on this Mac.

## SDK contract

The published type declarations of 2.6.39 and 2.6.41 differ only in `SDK_VERSION`.

## Lockfile

`pnpm update -r @defai-digital/ax-code-sdk@2.6.41 --lockfile-only` rewrote the SDK entries. pnpm also normalized one
unrelated pre-existing inconsistency: the `typescript-eslint` snapshot that resolves against typescript 5.8.3 pointed at
a plugin and parser snapshot built for 5.9.3; they now all use 5.8.3. The same change appears on a clean clone of the
previous candidate, so it comes from pnpm re-resolving and not from this update. It affects only lint tooling resolution.
The credential used to resolve the package was a temporary user-level npmrc outside the repository; the repository
`.npmrc` is unchanged.

## Validation

`verify-sdk-runtime.mjs` starts the downloaded signed runtime on loopback with isolated configuration and the actual
installed SDK 2.6.41: health, capabilities and the command catalog passed, with no model request. Result:
`native-sdk-smoke.json`.

The full check results for the candidate that carries this pin are recorded in its release candidate record.
This report is not signed Desktop installation, upgrade or rollback qualification.
