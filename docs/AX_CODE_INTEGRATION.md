# AX Code Integration Decisions

How this app integrates with the upstream AX Code runtime
(github.com/defai-digital/ax-code), which upstream-documented paths it uses,
and what is being tracked for the future.

## Transport choice: SDK headless + HTTP proxy

Upstream's SDK README defines the supported integration surfaces:

| Need                                            | Upstream-recommended path                |
| ----------------------------------------------- | ---------------------------------------- |
| App UI with a local process-isolated AX backend | `@ax-code/sdk/headless`                  |
| First-party desktop/native GUI                  | `@ax-code/sdk/grpc` (proto contract)     |
| TypeScript/JavaScript over raw HTTP             | `@ax-code/sdk/http` with `ax-code serve` |

This app uses the **headless** path: the web server launches the runtime via
`startHeadlessBackend` (`packages/web/server/lib/ax-code/lifecycle.js`) and
proxies its HTTP API to the frontend. On Windows/WSL and for wrapper or
custom-named binaries it falls back to spawning `ax-code serve` directly,
which matches upstream's documented HTTP contract.

Typed access goes through the generated v2 client: source code imports only
public SDK entry points (`@ax-code/sdk/v2`, `@ax-code/sdk/v2/client`,
`@ax-code/sdk/headless`, `@ax-code/sdk`). Deep `dist/` imports are not
allowed — the contract test in
`packages/web/server/lib/ax-code/sdk-contract.test.js` pins the entry points.

**Tracking:** upstream steers first-party desktop GUIs toward the gRPC/native
transport (`@ax-code/sdk/grpc`, `packages/sdk/proto` upstream). The headless
HTTP path is a valid documented choice and is what the Electron shell bundles
today; revisit gRPC if upstream deprecates headless HTTP for desktop GUIs or
when session streaming throughput becomes a bottleneck.

## Version pinning and compatibility

Two version axes move independently:

- **SDK** (`@ax-code/sdk`): vendored at `vendor/ax-code-sdk`, pinned per
  upstream policy ("pin clients to the AX Code version they target"). See
  `docs/AX_CODE_REVENDOR_CHECKLIST.md` for the re-vendor procedure.
- **Runtime/CLI** (`ax-code`): installed by the user, updates independently.
  `packages/web/server/lib/ax-code/version-compat.js` defines
  `MIN_SUPPORTED_AX_CODE_VERSION`; the server reports compatibility through
  `/api/ax-code/upgrade-status` and `/health`, logs a startup warning, and the
  UI raises a persistent toast when the installed runtime is too old.

## Upstream feature requests to file

Workarounds in `lifecycle.js` exist only because the SDK lacks options; each
should become an upstream issue against defai-digital/ax-code so the code can
be deleted:

1. **`startHeadlessBackend` should accept an explicit binary path/args.**
   Today it spawns a hardcoded `ax-code` from `PATH`, forcing this app to
   prepend the resolved binary's directory to `PATH` and to keep a legacy
   spawn path for wrapper launches (mise/asdf shims, custom binary names) and
   WSL.

2. **Headless handles should expose child-process lifecycle fields.** The
   handle returned by `startHeadlessBackend` lacks `exitCode`/`signalCode`,
   so the app patches them to `null` to keep its liveness checks working.

3. **Export the loopback-hostname guard.** The app mirrors the SDK's private
   `isLoopbackHostname` to decide when to set `allowNetworkBind`; an exported
   helper (or an SDK option that takes precedence) would remove the drift
   risk.
