# Independent Desktop release preparation

The existing GitHub latest release is `v1.4.3`. The historical source tag `v7.24.4`
is not an installer release and remains unchanged. Prepare Desktop `7.24.5` as
a new candidate while preserving the signed runtime `7.24.4` and exact SDK `2.6.7`.

PRD-2026-10-11-independent-desktop-release-preparation, ADR-009, and its specification
record the preparation scope without superseding the production migration gates.
The planned repository/tag pair is `defai-digital/ax-code-desktop` / `v<version>`.
Candidate builder metadata now targets that repository. The active updater and
shadow-only guard remain frozen until signed migration qualification.

Corrections include stable Electron 44.7.0, independent Desktop/runtime versions,
current workspace validation commands and public key location in the retained
publisher, policy-derived tag prefix, current Ubuntu packaging libraries, and a
read-only readiness command. The command checks secret names only; it does not
export keys, create releases, overwrite tags, or change repository visibility.

Local stable-Electron native menu/PTY and all three WebMCP probes passed on
Electron 44.7.0 / Chromium 152.0.7977.130. Typecheck, lint, boundary/release checks,
frozen install, and Desktop build passed. Root/Electron/UI suites passed; one
web registry test returned an unexpected HTTP 401 in the combined run, but its
isolated suite and the complete web suite rerun passed. Cross-platform CI and
shadow runs must independently verify the committed candidate.

## Remaining release gates

- GitHub lacks the six Apple signing/notarization secret names and three Azure
  Windows signing secret names required by the existing signed shadow workflow.
  Existing Minisign secret names are present. Secret values were not inspected.
- The repository is private. Unauthenticated installed apps cannot use a private
  GitHub release feed; an explicitly approved public distribution channel is required.
- Signed cross-platform shadow, real upgrade/rollback, data/credential continuity,
  and human cutover evidence remain pending. Readiness does not infer evidence
  from the presence of secrets or an enabled policy flag.

No official Release, tag replacement, credential export, repository visibility
change, or production updater switch has been performed by this preparation.
