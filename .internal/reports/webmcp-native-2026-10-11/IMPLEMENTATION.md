# Embedded WebMCP implementation evidence

Date: 2026-10-11. Status: locally implemented and native integration verified; unpublished.

The user's instruction to continue accepted the PRD, paired ADRs, and version 1 specification
for implementation. Their subsequent priority is enabling WebMCP; Rust migration is deferred.
The earlier README and probe records remain historical feasibility evidence.

## Isolated source ownership

- AX Coder: `feat/embedded-webmcp-v1` in `/Users/akiralam/code/ax-coder-webmcp`,
  based on `13e4263339963450b2e56711a717836f162ba651`.
- AX Code: `feat/desktop-webmcp-provider-v1` in `/Users/akiralam/code/ax-code-desktop-webmcp`,
  based on `5440434dafdf4acfb256fdae3d03b75b8ac23197`.
- Original checkouts and their concurrent changes were preserved. No merge or publication occurred.
- GUI ownership stays in AX Coder. Runtime tools, permissions, policy, and session binding stay in AX Code.

## Implemented behavior

Electron 44.7.0 supplies Chromium 152 and the native WebMCP feature. A dedicated sandboxed
`WebContentsView` uses an ephemeral partition without a privileged preload. Browser device permissions,
popups, downloads, credential-bearing navigation URLs, and non-web navigation are denied.
The renderer can request a project browser but cannot access the provider credential or native debugger.
The UI requires an active coding session and explicit agent enablement. Hiding, minimizing, closing, changing
the runtime, or destroying the owner revokes access. Concurrent enrollment is invalidated on teardown.

The producer captures a launcher-only boot secret. Its authenticated private `/desktop/browser`
routes provide capability negotiation, enrollment, snapshot updates, request polling, reply handling,
and revocation. Origin-bearing requests are rejected. Project configuration cannot enable enrollment.
The consumer uses the generic request client exported by the exact public JSR SDK 2.6.7; no sibling
source import or unpublished SDK dependency is added to AX Coder.

The version 1 provider stream is implemented as typed private long polling, not a second callback
server: 15-second empty polls, a 45-second provider lease, and 30-second operation deadlines.
Each operation binds provider ID, boot epoch, project, session, document generation, top-level origin,
frame, tool digest, and input. Catalogs are bounded to 128 tools/256 KiB, definitions to 32 KiB,
and arguments/results to 64 KiB. One operation is active per provider. Navigation and changed tool
definitions invalidate pending approvals and calls. Replies that lose a cancellation/navigation race
are discarded (`false` acknowledgment), never accepted as success and never automatically retried.

The `desktop_webmcp` tool uses the existing AX Code permission engine with an interactive request.
Managed origin policy restricts operations but does not replace approval. Inputs are detached before
approval and checked for credential-like values. Native results are marked untrusted.

## Verification

- AX Coder typecheck, lint, build, ownership/IPC/runtime boundaries, and release identity checks passed.
- AX Coder full suites: 61 root script, 391 Electron, 1,603 UI, and 794 web tests passed; one web test skipped.
- Native adapter: seven focused tests passed.
- Producer contract: nine tests passed, including late-cancellation acknowledgment and credential-like
  result rejection; risk-class coverage also passed.
- Native integration passed in two separate Electron processes through the actual public SDK request
  client, private producer HTTP routes, and real AX Code session permission engine. Both imperative
  tools and declarative auto-submit forms returned fixture results; abort and same-URL reload invalidated
  old requests. Installed Chrome and a remote debugging port were not used.
- An additional native run covered a form without `toolautosubmit`: the call stayed pending until
  fixed fixture-only JavaScript requested submission. This qualifies native deferred completion on a
  controlled page, not visible human interaction or arbitrary page script execution in production.
- SDK: 245 tests passed. Producer root scripts: 364 passed, 94 skipped; structure checks passed.
- Full producer deterministic verification passed: 1,266 suites passed, seven skipped; 13,999 tests
  passed, 23 skipped, zero failures. The final runner exited 0 after 404.6 seconds. Its local JUnit
  artifact is `.internal/reports/testing/junit/deterministic-1.xml` in the producer worktree.
  An import initialization cycle and missing risk classification found by the initial broad run were
  corrected before the successful full rerun. The permission still requires interactive approval.
- Final native integration and contract rerun: ten tests passed. Hiding the actual owner window
  revoked the producer enrollment. The fixture window was shown without activation for enrollment;
  this does not qualify the full production renderer layout or human interaction.

The opt-in native test is `packages/ax-code/test/mcp/desktop-browser-native.test.ts` in the producer.
It takes `AX_TEST_DESKTOP_ELECTRON` and `AX_TEST_DESKTOP_HARNESS`; the harness is
`harness/integration.cjs` here. Secrets stay in ephemeral child environment data.

## Delivery limits

The signed runtime pin remains 7.10.2. That published worker lacks the new provider capability;
the UI reports incompatibility rather than enabling a fallback or loading sibling source. A signed
producer release and verified runtime repin are required before end-user enablement. Public release
remains disabled under the existing shadow-release policy.

Native observations cover macOS arm64 and controlled fixtures. Windows/Linux/x64, signed packaged
Chrome-free hosts, upgrade/rollback, hostile real websites, visible manual form interaction,
and independently attested OS sandbox enforcement remain unqualified. No claim of production
qualification, installed application replacement, AX runtime receipt qualification, or broad
Chrome-standard conformance is made.
