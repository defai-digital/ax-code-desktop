# Electron 45 stable upgrade v1

Status: Scope authorized by the user's exact-version upgrade and feature-adoption instructions, 2026-11-08.
Implementation: Source and pnpm-generated lockfile updated; local workspace and packaged validation in progress.
Related: ADR-018; ADR-019; ADR-022; SPEC-2026-10-11-electron-45-candidate-v1.
Evidence: [Stable upgrade review](../reports/ELECTRON-45-2026-11-08-stable-upgrade.md).

## Scope

Upgrade the exact Electron dependency from `44.9.1` to stable `45.2.3` through pnpm, including its generated lockfile.
Adopt the lighter renderer startup path for the Mission Control pop-out, which has no legacy `<webview>` content.
Keep the shared sandboxed preload, context isolation, disabled renderer Node integration, and navigation guards.
Main workspace windows retain the legacy webview needed by the existing context-panel preview.

The earlier Electron 45 beta experiment remains historical. This specification governs the stable upgrade only;
it does not change the supported OS/architecture set, identity, runtime/SDK pins, update policy, or permissions.
Local model inference remains under the canonical AX Code/AX Engine integration. No additional inference runtime
or Local Prompt API provider is introduced by this dependency upgrade.

## Compatibility review

- Sandboxed preloads must work without Electron's removed Node module shims or `Buffer`/immediate globals.
  Bundle local preload modules and retain the IPC allowlist; test the bridge in an actual sandboxed renderer.
- Keep native WebMCP activation before app readiness and preserve the existing `document.modelContext` integration.
  Compare feature-disabled and feature-enabled runs on the exact binary, including invocation, cancellation,
  navigation cleanup, and the real provider adapter's interruption behavior.
- Rebuild `node-pty` for the selected Electron ABI and exercise a real PTY round trip and native menus.
- Keep ASAR native addons and executable helpers on real filesystem paths; do not transfer archive file descriptors
  to native consumers. Keep the existing application CSP and authenticated API routing when serving assets.
- Do not expand display-capture permissions as part of the upgrade. Existing deny-by-default browser policy stands.

## Acceptance

1. Manifest and pnpm-generated lockfile agree on `45.2.3`; the exact SDK remains `2.6.69` from GitHub Packages.
2. A behavioral regression proves Mission Control disables `webviewTag` while preserving the shared sandbox and
   window/navigation behavior. Main workspace preview support remains enabled.
3. From the repository root, pass `check:boundaries`, `check:locales`, `typecheck`, `lint`, `test`, and `build`.
4. Pass the native Electron/PTY and WebMCP smokes on the target engine. Qualify packaged ASAR, renderer preload,
   bundled runtime, startup/quit, and renderer journeys with isolated profiles.
5. Windows and Linux checks, signed upgrade/rollback, and credential continuity remain platform-specific release
   gates. Isolated macOS probe results cannot substitute for those receipts or authorize publication.

Rollback restores the previous exact Electron dependency and generated lockfile and rebuilds native modules for
that ABI. No user-data migration or identity change is required by this scoped upgrade.
