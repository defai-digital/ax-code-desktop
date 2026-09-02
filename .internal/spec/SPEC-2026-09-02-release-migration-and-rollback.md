# SPEC: Desktop Release Migration and Rollback

| Field   | Value                            |
| ------- | -------------------------------- |
| Status  | Accepted implementation contract |
| Related | Active PRD; ADR-004; ADR-006     |

## 1. Ownership stages

1. AX Code remains the only public Desktop publisher.
2. AX Coder produces unsigned local builds with updater disabled.
3. AX Coder CI produces non-public signed shadow artifacts.
4. Shadow artifacts pass packaging, signing, artifact audit, upgrade, rollback, and platform smoke tests.
5. A human approves the paired source/release ownership cutover.
6. AX Coder publishes one compatibility release using the preserved identity and updater contract.
7. Real update and rollback are verified before AX Code disables its Desktop publisher.
8. AX Code removes Desktop source only in the paired final change.

No workflow in AX Coder may publish publicly before stage 5.

## 2. Release inputs

Every candidate records AX Coder commit, source extraction baseline and mapping, SDK version and registry integrity,
runtime release/version/digests/signatures, Desktop package versions, toolchain versions, dependency lock digest, build
commands, signing identity references, and test results.

Runtime assets must already exist as signed AX Code release artifacts. A Desktop release cannot build or sign an AX Code
runtime from sibling source.

## 3. Shadow workflow

Port the current macOS arm64, Windows x64/arm64, and Linux x64/arm64 build matrix. Preserve ASAR integrity, native addon
rebuild, sidecar verification, notarization/Authenticode policy, Minisign signatures, updater metadata validation,
packaged-app smoke, and release asset audits. Credentials remain in approved CI secret stores and are never exported to
logs or repository artifacts.

## 4. Upgrade and rollback

Test update from the last AX Code-owned release to the AX Coder candidate, then reinstall or update back to the last
verified compatible release. Settings, projects, sessions, credentials, application identity, TCC/Keychain access, and
data schema remain intact. A non-downgradable schema is frozen read-only with an explicit recovery path; no lossy
automatic downgrade is allowed.

## 5. Failure rules

Any signature, updater, data, smoke, runtime compatibility, or rollback failure blocks cutover. Keep the AX Code public
release path operational until the first AX Coder-owned release is verified. Never overwrite immutable artifacts or
reuse a version for different bytes.
