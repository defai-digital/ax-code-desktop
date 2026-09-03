# ADR-006: Preserve Application Identity During Source Ownership Transfer

| Field          | Value                                                                                                         |
| -------------- | ------------------------------------------------------------------------------------------------------------- |
| Status         | Accepted                                                                                                      |
| Implementation | Identity and release guards implemented; signed shadow execution pending                                      |
| Date           | 2026-09-02                                                                                                    |
| Deciders       | User; AX Coder and AX Code release maintainers                                                                |
| Related        | Active PRD; SPEC-2026-09-02-release-migration-and-rollback; SPEC-2026-09-02-user-data-and-identity-continuity |

## Context

Changing the source repository does not require changing the installed application's identity. Combining extraction
with a new bundle ID, data path, credential-service name, protocol, signing identity, or updater feed could strand
existing installations and invalidate macOS TCC or Keychain continuity.

## Decision

The extraction candidate preserves the current display name, executable and package names, bundle/application IDs,
protocol handlers, data/cache/log paths, Keychain or credential-service identifiers, signing identities, public
verification keys, and updater behavior. Legacy `openchamber` and `opencode` identifiers remain wherever compatibility
tests show they are load-bearing.

AX Code remains the public Desktop release owner until AX Coder independently builds signed shadow artifacts and passes
upgrade, rollback, data, credential, updater, and platform smoke gates. The target repository remote and public release
channel are not assumed by local initialization. Public ownership changes only through an explicit paired cutover.

Rebranding is a later product decision with its own migration ADR. It is not part of source extraction.

## Implementation evidence

AX Coder commit `6e0ce9438cf6f9087930a53f3bde13ee2896feda` added tracked compatibility identity and release-policy
manifests, source-to-package contract checks, fail-closed Electron packaging, and a guarded legacy release entrypoint.
The manual shadow workflow has read-only repository permission, requires explicit shadow acknowledgement and a private
repository, and uploads only short-lived GitHub Actions artifacts. It has no tag trigger, GitHub Release creation,
updater mutation, or public publishing path.

The local unsigned macOS arm64 path passed packaging, artifact collection, bundled-runtime smoke, full packaged-app
smoke, and packaged ASAR CLI smoke. A real signed workflow run, OS credential continuity, update, and rollback are not
yet evidence because AX Coder has no remote or CI secret store.

## Consequences

- Existing users see no identity migration in the first AX Coder-owned compatibility release.
- Shadow release workflows may temporarily duplicate mechanics, but only AX Code may publish publicly before cutover.
- Signing and updater credentials are referenced by CI configuration and never copied into repository history.

## Rollback

Before cutover, continue the AX Code-owned channel. After cutover, reinstall the last verified compatible artifact
without modifying user data. Unsafe schema downgrade freezes the affected state read-only and provides recovery steps.
