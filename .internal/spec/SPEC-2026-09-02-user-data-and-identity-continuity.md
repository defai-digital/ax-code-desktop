# SPEC: User Data and Application Identity Continuity

| Field   | Value                                                               |
| ------- | ------------------------------------------------------------------- |
| Status  | Source identity gate implemented; signed continuity tests pending   |
| Related | Active PRD; ADR-006; SPEC-2026-09-02-release-migration-and-rollback |

## 1. Frozen identity

The extraction release preserves the values and behavior from the source baseline, including:

| Identity                     | Baseline contract                                                |
| ---------------------------- | ---------------------------------------------------------------- |
| Display/product name         | `AX Code`                                                        |
| macOS/desktop application ID | `ai.defai.ax-code-app`                                           |
| Artifact prefix              | `AX-Code-${version}-${os}-${arch}`                               |
| Packaged renderer origin     | `app://ax-code`                                                  |
| Electron package             | `@ax-code/electron`                                              |
| Web package and command      | `ax-code-desktop`                                                |
| Legacy command               | `openchamber`                                                    |
| Updater provider             | GitHub repository `defai-digital/ax-code` until approved cutover |
| Minisign Keychain defaults   | service `ax-minisign`, account `ax-release`                      |
| Apple notarization profile   | `ax-notary`                                                      |

Windows application identity, Linux package identity, protocol registrations, signing subject/thumbprint, public
Minisign key, data/cache/log/settings paths, credential-service names, and compatibility environment variables remain
byte-for-byte or behaviorally equivalent to the baseline configuration and tests.

## 2. Data rules

The source extraction does not migrate or rewrite user data. The candidate opens the existing locations through the
same application identity. Tests use isolated profiles and copies; they never point an unsigned development build at a
user's live production data.

Database and settings migrations are forward-only, transactional, idempotent, and backed up before mutation. The
candidate records schema version and migration result without raw credentials. On failure, leave the original data
recoverable and stop startup with actionable guidance.

## 3. Credential and OS permission continuity

Repository code stores references and identifiers, never credential values. Keychain, Credential Manager, libsecret,
TCC, notarization, and Authenticode continuity can be verified only with a correctly signed shadow candidate. Unsigned
build success is not evidence for these gates.

## 4. Rebrand boundary

`AX Coder` is the repository and future portfolio product name, but the first compatibility release keeps the installed
AX Code Desktop identity. Any display name, bundle ID, path, protocol, credential-service, or updater repository change
requires a later ADR with coexistence, migration, downgrade, and user communication plans.

## 5. Verification matrix

For each supported OS, test clean install, existing-install upgrade, first launch, projects, settings, sessions,
credentials, terminal, notifications, updater, sleep/resume, app restart, and rollback. Compare path and identity
snapshots before and after. Redact all exported diagnostic values.

## 6. Current implementation

`config/desktop-identity.json` and `script/desktop-release-contract.mjs` freeze the source extraction commits, package
names, commands, bundle ID, product and artifact names, renderer origin, updater owner and tag prefix, signing
identifiers, and Minisign Keychain identifiers. The gate binds those values to Electron Builder, updater, renderer,
signing, package, runtime, SDK, lockfile, and shadow-workflow sources. Local smoke always uses an isolated profile and
disables auto-update.

These source and unsigned-package checks do not establish Keychain, TCC, Credential Manager, libsecret, upgrade, or
rollback continuity. Those gates require correctly signed private shadow artifacts and remain pending.
