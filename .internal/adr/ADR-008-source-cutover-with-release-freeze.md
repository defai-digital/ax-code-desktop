# ADR-008: Separate Desktop Source Cutover from Public Release Cutover

| Field      | Value                                                                     |
| ---------- | ------------------------------------------------------------------------- |
| Status     | Accepted; implemented                                                     |
| Date       | 2026-09-02                                                                |
| Deciders   | User; AX Coder and AX Code maintainers                                    |
| Supersedes | ADR-002 and ADR-006 only for the ordering of local source removal         |
| Related    | Local source-cutover PRD; ADR-003; ADR-004; source-ownership cutover spec |

## Context

AX Coder already contains the reviewed Desktop history and an independently verified workspace. AX Code still contains
the duplicate source because the original plan coupled source removal to signed public-release migration. AX Coder has
no remote or signing environment, so that coupling would leave two source owners indefinitely.

The user explicitly requires GUI source to live in AX Coder and to be removed from AX Code now. This direction changes
the source-removal order, but it does not supply evidence for or authorize a public release migration.

## Decision

AX Coder becomes the sole current production Desktop GUI source owner before public release cutover. AX Code removes
the GUI tree and Desktop-owned build/release integration while retaining the coding runtime, CLI, TUI, headless server,
SDK producer, native modules, integrations, and intentional external-app launcher.

Public Desktop release ownership is frozen between the source cutover and the later release cutover:

- AX Coder remains `shadow-only` and cannot publish publicly.
- AX Code removes its Desktop publisher and tag-triggered Desktop workflow.
- Existing published AX Code Desktop artifacts and updater metadata are not changed.
- A future public publisher requires the original signing, upgrade, rollback, data-continuity, and explicit human
  approval gates.

Runtime contracts mentioning desktop or GUI clients remain in AX Code because they are consumed by AX Coder and other
native hosts; they are not a second GUI implementation.

## Implementation evidence

- AX Coder governance authorization: `daed764`.
- AX Coder source-ownership enforcement: `0a354744ca81f1ac90a1a4f8f11b8697d2e30268`.
- AX Coder Desktop Winget ownership: `7e92a80736d3e36534df9109dc04d742098d1c1f`.
- AX Code source removal: `6a2e03d90411ddd7141047baa59d4a754f1c4107`.
- Verification ledger: `.internal/reports/PHASE-4A-2026-09-02-local-source-cutover.md`.

AX Coder tracks 2,751 Desktop files and remains `shadow-only`. AX Code tracks no `desktop/**` path and has no Desktop
build or publication workflow.

## Consequences

- Current source ownership is unambiguous immediately.
- Desktop public releases are intentionally paused until AX Coder has an authorized remote and complete evidence.
- AX Code remains more than a TUI: it is the canonical coding runtime and contract producer.
- The cutover does not rebrand the installed application or alter user data, credentials, updater feeds, or signatures.

## Rollback

Revert the linked AX Code removal commit and the AX Coder ownership-record commit. Do not rewrite extracted history,
delete AX Coder, or copy dependencies/build output between repositories.
