# AX Code SDK Re-Vendor Checklist

The app vendors `@ax-code/sdk` at `vendor/ax-code-sdk` (consumed via
`"@ax-code/sdk": "file:./vendor/ax-code-sdk"`). Upstream develops the SDK at
monorepo HEAD, so behavior can change without a version bump. A few SDK
internals are mirrored or patched in this repo; each re-vendor must re-verify
them.

Work through this list every time `vendor/ax-code-sdk` is replaced:

1. **Bump the contract test pin.** Update `EXPECTED_VENDORED_SDK_VERSION` in
   `packages/web/server/lib/ax-code/sdk-contract.test.js`. The test failing is
   the reminder to do the rest of this list — do not just bump the pin.

2. **Re-verify the loopback guard mirror.** `isSdkLoopbackHostname` in
   `packages/web/server/lib/ax-code/lifecycle.js` mirrors the SDK's private
   `isLoopbackHostname` so `allowNetworkBind` is only set for explicitly
   non-loopback hostnames. Diff the new SDK's guard (search the vendored
   `dist/headless` sources for the "only binds the HTTP API to loopback
   hostnames" error) against the mirror and the fixtures in
   `sdk-contract.test.js`.

3. **Re-verify the headless handle patch.** `createManagedAxCodeServerProcess`
   in `lifecycle.js` spreads `{ exitCode: null, signalCode: null }` onto the
   `startHeadlessBackend` handle because SDK handles lack child-process fields.
   If the SDK starts returning these fields, remove the patch.

4. **Re-verify explicit launcher options.** `startHeadlessBackend` must keep
   accepting `binary` and `args`. `lifecycle.js` depends on those options so
   macOS/Linux wrapper launches and custom binary names stay on the SDK-owned
   readiness/auth/diagnostics/shutdown path. If the SDK changes these options,
   update lifecycle.js and the wrapper-launch fixtures before shipping.

5. **Review the minimum supported runtime version.**
   `MIN_SUPPORTED_AX_CODE_VERSION` in
   `packages/web/server/lib/ax-code/version-compat.js` gates the installed
   ax-code CLI. If the new SDK depends on newer server endpoints or response
   shapes, raise the minimum and note why in the constant's comment.

6. **Run the full gate.** `bun run check:boundary && bun run
   check:endpoint-contracts && bun run test && bun run type-check`.

Upstream integration context (transport choice, pending upstream feature
requests) lives in `docs/AX_CODE_INTEGRATION.md`.
