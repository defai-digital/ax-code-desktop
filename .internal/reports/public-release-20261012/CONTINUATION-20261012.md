# Public Release Continuation

The user requested continuation after authorizing public release with Minisign,
Apple signing/notarization, and Windows Authenticode. No new approval was requested.

## Qualified shadow attempt

Required-signature shadow run 38194047049 was dispatched against
05d2f03091606822d6ec62c4b3e9387bb9417f45. On inspection it remained queued without
jobs; dispatch is not execution or qualification. The previous failed run's GitHub
annotation explicitly reports failed account payments or a spending-limit blocker.
Desktop repository secret metadata still exposes only the two required Minisign
secret names (plus unrelated tap credentials). Apple/Azure signing secret names are
not present, and no repository environment is configured. No private local key was
exported or spending budget changed. Existing signed local macOS artifacts remain
preserved; Windows and Ubuntu qualification is not claimed.

## First-cutover operator fix

A disabled Worker returns 503 and prevents the previous upload command's anonymous
read-after-write verification. Added authenticated `stage` and gated `gateway-cutover`
so a qualified first release can be fully verified in R2 before serving is enabled.
The cutover checks every anonymous artifact/alias and restores the disabled Worker
if activation or public proof fails. Infrastructure deploy refuses to shut down an
already public gateway. Staging snapshots reject changed source digests and preserve
immutable collision checks, readiness-last and pointer-last ordering.

The unchanged live Worker remains disabled; no Desktop objects were uploaded or
serving enabled. Required policy, signed inventory/qualification, platform signatures
and native migration evidence are still enforced.

## Verification

Root scripts: 116 passed, four skipped because PowerShell is unavailable in this
shell. Regression coverage includes authenticated storage byte proof, immutable
collision rejection, source mutation detection, marker/pointer ordering, absence of
mutations before qualification, successful activation and disable-on-failed-public-
proof. These tests use mocked storage/deployment and are not native qualification.

Node and Bash syntax, Git whitespace checks, all repository boundaries, Wrangler
isolated dry-run and the real gateway check passed. The gateway check reads the live
publication setting and independently confirms the existing AX Code installer is
still available. Native public installation remains unavailable pending signed
cross-platform and migration qualification.
