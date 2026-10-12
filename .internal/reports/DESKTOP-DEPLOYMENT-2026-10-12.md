# Desktop Deployment Implementation and Integration

Date: 2026-10-12 UTC.
Related: ADR-010; Desktop download distribution specification v2.

## Implemented surface

The executable operator entry is `.internal/deploy/deploy`. It supports help,
read-only `gateway-check`, isolated `gateway-deploy`/dry-run, signed-input `prepare`,
complete-inventory `verify`, and policy/qualification-guarded `upload`.
Cloudflare configuration and the subprocess environment pin the DEFAI account.
Gateway deployment refuses route takeover, broader routes, alternate buckets,
public aliases and public enablement. Credentials remain in process memory or the
existing authenticated Wrangler configuration, never in repository artifacts.

The Bash bootstrap installs signed macOS Apple Silicon DMGs or Ubuntu 24.04+
amd64/arm64 DEBs. The PowerShell bootstrap accepts only native Windows x64 and
checks the frozen Authenticode certificate before starting NSIS. Both use pinned
Minisign verifier archive hashes, the existing release public key, a signed version
pointer/manifest, a matching signed readiness marker, and installer size/digest
verification. macOS checks Developer ID, Gatekeeper, bundle identity/version and
stages a complete replacement with recovery of the previous app on a failed swap.
No installer removes profiles or credentials. The legacy Unix entry retrieves the
complete native bootstrap and no longer installs an npm web package.

Preparation verifies all input signatures and rejects source symlinks or an existing
output. Upload verifies signed qualification for the exact source, version and
inventory, every original cutover gate and all four platforms. It refuses immutable
object replacement, verifies anonymous public bytes, writes version readiness last,
then advances mutable aliases and the signed latest pointer. Interrupted
pointer/signature changes fail closed; they are not described as atomic R2 updates.

## Verification

- Final root script suite: **111 passed, zero skipped**, 21 files. This includes the
  four Windows validation cases executed with real PowerShell 7.6.6 on macOS;
  native OS/API, installer execution and signature responses are mocked in those
  tests. The previous operator snapshot's 107 passed/four skipped is historical.
- Bash syntax, PowerShell AST parsing, Node/ESLint checks, actionlint, repository
  release/ownership boundaries and Git whitespace checks passed.
- The pinned upstream macOS Minisign 0.12 binary verified a real existing AX Code
  v7.24.4 installer signature. Production-key verification rejected altered bytes.
  The fixture installer was not executed.
- Local workerd/R2 integration: exact full bytes at HTTP 200; correct byte range
  and Content-Range at HTTP 206; unrelated CLI namespace rejected with HTTP 404;
  unsatisfiable range rejected with HTTP 416. Local serving was enabled only in
  the test process, which was stopped after verification.
- `.internal/deploy/deploy --help`, `gateway-check`, and
  `gateway-deploy --dry-run` passed against the final integrated operator.
- A live bootstrap probe failed closed when the installer alias was unavailable;
  no application installation occurred. Public upload remains blocked by policy
  before credential access or network mutation.

## Observed live infrastructure

The independent `ax-code-desktop-downloads` Worker, `ax-code-desktop-releases`
bucket and `download.automatosx.com/ax-code-desktop/*` route exist. The live
installation endpoint returns **503**, `Cache-Control: no-store`, and the expected
disabled-publication message. The existing AX Code custom-domain Worker and CLI
installer remain available. Source/live snapshots are retained under
`cloudflare-desktop-20261012/`; the operator check independently reconfirmed this
state. DNS ownership remains with the user.

## Qualification limits

No Desktop installer artifacts, new release tag or official release were published.
The current release policy and active updater remain frozen. Native fresh install,
upgrade, rollback, credential/data continuity and full signed platform evidence
remain required; mocked bootstrap tests do not satisfy those gates. Apple/Azure
credential availability and GitHub Actions billing were previously blocking
cross-platform qualification and have not been changed by this implementation.
The anonymous generic updater cutover remains separate from bootstrap/gateway
implementation. Historical verification snapshots are preserved rather than
rewritten to imply they cover newer source or a public release.
