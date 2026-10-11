# Electron 45 WebMCP Candidate Qualification v1

Status: Implementation plan for an unpublished desktop candidate.

## Scope

Compare Electron 44.7.0 with the exact Electron 45.0.0-beta.1 candidate using native
WebMCP in a sandboxed `WebContentsView`, then qualify the candidate for local development
and shadow packaging. Keep public release disabled. This dependency upgrade does not
accept the separate embedded-provider PRD/ADRs or make AX Code worker integration available.

Electron 46 is not a qualification target: its scheduled alpha begins October 22, 2026,
and its stable release is scheduled for January 5, 2027. Reassess a concrete candidate
with the same capability checks when available; do not infer compatibility from a major number.

## Implementation

1. Add a repeatable native capability smoke with a controlled HTTP loopback fixture,
   an isolated disposable profile, no installed Chrome, no remote debugging port,
   no Node integration in guests, and no sandbox or web-security bypass.
2. Observe feature-disabled controls and feature-enabled discovery, imperative and
   declarative invocation, cancellation, tool removal, and navigation cleanup. Record
   actual Electron/Chromium identities and fail the smoke on missing capabilities.
3. Pin Electron exactly to `45.0.0-beta.1` for the development/shadow candidate and
   update the frozen pnpm lockfile. Set the macOS minimum to 13.0. Keep existing
   x64/arm64 Windows and Ubuntu Desktop 24.04+ targets and compatibility identities.
4. Rebuild `node-pty` against the selected Electron ABI, test a real PTY round trip,
   validate all desktop tests, typecheck, lint, translation and boundary checks, and build.
5. Package an unsigned isolated macOS arm64 candidate with `--publish=never`, verify
   ASAR integrity/fuses and bundled runtime, and run the existing packaged smoke.

## Acceptance and release limits

Native engine evidence is distinct from application provider enrollment, AX Code
permissions and receipts, real-site compatibility, and signed release qualification.
Only controlled local fixtures are exercised. The smoke must never be loaded by the app.
Agent access remains governed by the separate accepted contracts; this task introduces
no production WebMCP feature switch or runtime authority.

Windows and Ubuntu execution, signing/notarization, upgrade and rollback remain explicit
open gates when no matching hosts or credentials are exercised. A beta pin must be
replaced by a separately tested exact stable pin before public release; a calendar date
or future dependency resolution is not approval or qualification.

Rollback restores the previous exact Electron pin and lockfile and rebuilds native
modules for that ABI. No bundle identity, updater channel, user-data location, runtime
pin, public SDK version, permissions, or budget changes are required.

## Sources checked on October 11, 2026

- https://releases.electronjs.org/release/v45.0.0-beta.1
- https://releases.electronjs.org/schedule
- https://www.electronjs.org/blog/electron-44-0
- https://developer.chrome.com/docs/ai/webmcp/imperative-api
