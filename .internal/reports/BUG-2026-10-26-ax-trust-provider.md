# AX Trust provider setup missing from Desktop

## Confirmed cause

Desktop 7.30.2 omits the AX Trust setup action from its Connect Provider picker. The pinned AX Code 7.30.1 runtime and
SDK 2.6.53 already support it; no runtime or SDK upgrade is needed for this repair.

The runtime's `GET /provider` lists catalog and connected providers, not client setup actions. In the exact pinned
`v7.30.1` TUI source, `dialog-provider.tsx` adds `withAxTrustProviderDialogEntry` before building its categories. Selecting
the SDK's `AX_TRUST_PROVIDER_OPTION_ID` (`__ax-trust__`) opens the managed URL/token form and submits
`management: "ax-trust"` through the existing custom-provider route.

Desktop imported the category taxonomy, but injected only the custom-API setup action. Its categories are derived from
the resulting provider IDs. With no configured AX Trust gateway in the runtime catalog, there was no AX Trust option
and therefore no AX Trust category. The same failure was reproduced in the real Electron renderer with an empty
fixture catalog: native WebMCP could not discover AX Trust.

A second independently reproduced integration gap affected persisted gateways: Desktop's custom-provider parser
dropped the runtime's optional `management` metadata, and the form draft/submission/refresh contracts did not carry it.
Hostname-derived IDs such as `enterprise-gateway` therefore lacked the metadata needed for AX Trust categorization.
This is distinct from proof about any particular user's stored gateway configuration, which was not read.

## Repair

- Always add the shared SDK AX Trust setup action, removing duplicate sentinel rows if a response already contains one.
- Route that action to the existing URL/token form with AX Trust management selected; keep ordinary API-key, CLI,
  local-runtime and private-GPU flows intact.
- Read and validate the public SDK management enum, carry it through creation/edit/model refresh, and apply the shared
  taxonomy's category overrides to managed providers with arbitrary IDs.
- Reuse an already registered endpoint and its provider ID/token when explicitly connecting it as AX Trust. Do not
  create another connection or require the saved token to be entered again. Remount drafts when switching setup actions.
- Keep discovery, credential encryption, persistence and model routing in the canonical runtime through its existing
  `PUT /provider/custom/:providerID` contract. No second runtime, server route or credential store was introduced.

## Verification

- Before-fix parser/draft regressions failed on missing management metadata. Before-fix component tests failed on the
  missing AX Trust category; the original native build also failed to discover that control.
- Three focused suites pass **56 tests**, including empty-catalog discovery, URL/token submission, failed save/retry,
  arbitrary-ID categorization, endpoint/token reuse, metadata round-trip, editing and model refresh.
- All six root gates passed: boundaries, locales, typecheck, lint, tests and build. The root test run passed 8,237 tests
  with 10 skipped. After adding the endpoint-reuse case, the final full UI suite passed **5,274 tests**; UI typecheck and
  root lint were rerun successfully.
- The corrected native WebMCP journey passes boot, AX Trust setup, CSP and renderer-error checks. Fresh control/DOM
  reads and screenshots show the category and URL/token form in both dark and light themes. Both screenshots were
  visually inspected. The first post-fix helper incorrectly expected a semantic `textbox` role, while the developer
  adapter reports the actual `input` tag; correcting that helper did not change the product or its assertions.
- Logs, failure attempts, screenshot/control artifacts and source hashes are retained in
  `.internal/releases/ax-trust-provider-20261026/verification.json` and its sibling files. The repeatable native command
  is documented in `docs/development-webmcp.md`.

This verification uses an isolated empty-catalog runtime fixture and mocked API submissions. No real credentials were
submitted and no live AX Trust model request was made. Published v7.30.2 artifacts are unchanged; this repair does not
claim a new release or installed-app update.
