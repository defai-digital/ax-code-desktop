# Desktop Deployment Review

Review date: 2026-10-11 America/Toronto (2026-10-12 UTC).

## Findings and changes

Read the AX Code deployment wrapper, mirror and gateway source without changing
that sibling repository. Its private-source/public-R2 pattern applies to Desktop,
but its CLI/SDK publishing command and asset inventory do not. The shared hostname
currently rejects paths outside `/ax-code/`; a direct HEAD request to the proposed
`/ax-code-desktop/install` returned 404. Desktop installers/gateway remain a planned
surface, specified under ADR-010; no public files were uploaded.

At the user's request, removed Windows ARM64 from CI/shadow matrices, runtime
consumption pin, staging, artifact/evidence targets and WinGet output. Package
entry points reject unsupported Windows architectures before staging. macOS and
Ubuntu ARM64 remain supported; historical tags/evidence are preserved.

The unsigned shadow run at source `534511bc4aa1b87ef3060dc034f090bfb3c95945`
([run 38186349710](https://github.com/defai-digital/ax-code-desktop/actions/runs/38186349710))
passed macOS, Ubuntu ARM64 and web packaging. Windows x64 failed because Git's
CRLF checkout changed the pinned public key from 113 to 115 bytes. Added a binary
Git attribute and a real autocrlf checkout regression; hash/signature pins remain
unchanged. Ubuntu x64 passed packaging and ASAR smoke but artifact collection
rejected electron-builder's `x86_64` AppImage / `amd64` DEB names. The collector now
accepts these exact native aliases, preserves metadata names and rejects other
architectures. Regression tests cover the actual generated names.

Corrected the README's stale Electron 45 beta statement to the current exact
stable 44.7.0 pin and current platform matrix.

## Verification

- Root release/workflow/runtime/WinGet tests: 80 passed.
- Targeted Electron packaging/staging tests: 20 passed.
- Full Electron suite: 456 passed; lint passed across all three Desktop packages.
- Typecheck, release/ownership boundaries, actionlint and diff whitespace checks passed.
- The previous source `ee5ae6176af9f8391148714716d25b85046ec22c` completed Desktop CI
  and CodeQL; these results do not qualify this newer source. Fresh CI and an
  unsigned four-platform shadow run must verify the committed fix.

## Remaining release evidence

The required-signing shadow preflight at `ee5ae617` failed before building:
six Apple and three Azure inputs are unavailable to this workflow
([run 38186735702](https://github.com/defai-digital/ax-code-desktop/actions/runs/38186735702)).
Minisign inputs are present. Do not infer credential availability from a successful
unsigned run or copy local signing secrets to GitHub automatically.

A local macOS candidate application was Developer ID signed, notarized and
stapled, and passed codesign/spctl and packaged runtime/ASAR smokes. Independent
DMG notarization was blocked by an unavailable `ax-notary` profile; the DMG is not
qualified. These local artifacts do not constitute cross-platform release proof.

Fresh install, upgrade, rollback, data/credential continuity, the Desktop gateway,
both bootstrap implementations, anonymous generic updater qualification and human
cutover approval remain pending. Public release and the active updater remain
frozen according to AGENTS.md and the existing policy. No official release, new
release tag, repository visibility change or sibling gateway deployment occurred.
