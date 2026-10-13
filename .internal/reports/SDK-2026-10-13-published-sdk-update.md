# Published AX Code SDK update: 2.6.7 to 2.6.12

Date: 2026-10-13

## Release evidence

- JSR package metadata reports `2.6.12` as the latest published version, created
  at `2026-10-13T03:04:26.399793Z`:
  <https://jsr.io/@defai-digital/ax-code-sdk/meta.json>.
- GitHub tag `sdk-v2.6.12` resolves to producer commit
  `52cc87d16516077e503c46b159305f286bc6d560`. The tag itself is unsigned;
  its object identity was checked through the authenticated GitHub API.
- The producer's "Publish SDK to JSR" workflow completed successfully:
  <https://github.com/defai-digital/ax-code/actions/runs/38339746096>.
- The `v7.25.1` release notes identify SDK `2.6.12` and its IPC framing fixes:
  <https://github.com/defai-digital/ax-code/releases/tag/v7.25.1>.

## Change

The Electron, UI, and web manifests now consume exactly
`jsr:@defai-digital/ax-code-sdk@2.6.12`. The SDK configuration records the
matching producer commit, and the pnpm lockfile records the published JSR
tarball and integrity. No other dependency was upgraded. The release-contract
and shadow-evidence tests now expect the new SDK release inputs.

The producer diff adds generated Desktop browser API contracts, updates a
provider model identifier, and bounds IPC frames and fragmented copying while
rejecting truncated reads. Its headless lifecycle, compatibility checker, and
v2 client wrapper are unchanged between the two SDK tags. Desktop's production
transport remains HTTP/SSE/WS; this dependency update does not activate IPC,
gRPC, or the isolated Rust experiment. It makes no application speedup claim.

## Validation

Environment: Node `26.5.0`, pnpm `10.33.4`, macOS arm64.

- `pnpm install --frozen-lockfile`: passed; no resolution or lockfile change.
- `pnpm run typecheck`: passed.
- `pnpm run lint`: passed.
- `pnpm run test`: 3,113 passed, 7 existing skips. Root scripts: 137 passed,
  6 skipped; Electron: 476 passed; UI: 1,704 passed; web: 796 passed, 1 skipped.
- `pnpm run check:boundaries`: passed, including release contract and runtime pin.
- `pnpm run build`: all three tasks passed, zero cache hits; includes Electron
  main/server bundling and native module rebuild. Vite emitted chunk-size and
  mixed static/dynamic import warnings.
- `pnpm run bench:sync-transport`: passed using installed SDK `2.6.12`, with
  JSON/protobuf round-trip checks. This is a synthetic codec check, not an
  end-to-end performance measurement.
- Live SDK compatibility smoke: the published SDK launched the existing packaged
  `7.24.4` darwin-arm64 runtime with an isolated temporary profile and workspace,
  a fresh password, a dynamically allocated loopback port, and a minimal
  environment without provider credentials. Authenticated health, advertised
  session capability compatibility, unauthenticated HTTP 401, generated v2
  session create/get/delete, and SSE `session.created` delivery passed. No model
  requests were made; the owned backend and temporary state were cleaned up.
- `git diff --check`: passed.

The runtime pin stays at `7.24.4`. The live probe establishes local API
compatibility for the tested operations; it does not qualify signed installation,
cross-platform upgrades, rollback, or publication. Earlier performance reports
retain their historical SDK version and measurements.
