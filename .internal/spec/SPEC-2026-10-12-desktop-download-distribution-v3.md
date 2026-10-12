# Desktop Download Distribution v3: First Public Cutover

Date: 2026-10-12 UTC.
Supersedes: v2 first-publication operator details only; signing and qualification gates remain active.
Authorization: the user approved public Desktop release and required Minisign, Apple signing/notarization and Windows signing.

A disabled Worker returns 503 for every valid object path. Therefore the ordinary
public-byte-verified upload operation cannot bootstrap the first release. Do not
change the Worker to public mode merely to work around this ordering problem.

Add `stage --source DIR --qualification SIGNED_JSON`. It checks approved release
policy and the exact signed inventory/qualification before credential or mutation
access. Snapshot bytes must match inventory digests before the first write. Require
the DEFAI account and an explicitly disabled live gateway. Upload through the
existing authenticated R2 object API and read back the exact bytes through that
API. Existing immutable objects with different bytes must never be replaced.
Readiness is last within the version, root latest pointer is last globally.
Objects exceeding the R2 REST upload limit fail before the first mutation; they
require separately qualified multipart tooling, not a silent partial upload.

Add `gateway-cutover --source DIR --qualification SIGNED_JSON`. Recheck policy,
Minisign signatures, all five gates, all four native platforms and exact inventory
identity before accessing credentials. All staged objects and aliases must match
local verified bytes through authenticated R2 reads before changing serving state.
Deploy an isolated Worker snapshot with public mode enabled, preserve the AX Code
custom-domain ownership, then prove every versioned object and alias anonymously.
If activation or anonymous proof fails, redeploy the disabled configuration. If
that restore also fails, report an explicit emergency restore requirement.

`gateway-check` reads the live publication binding and checks the corresponding
public response. Infrastructure-only `gateway-deploy` refuses to disable an already
public gateway. Keep the checked-in default disabled; only qualified cutover changes
live serving. Existing active-release `upload` retains anonymous-byte verification.

No mock operator test is native installation, platform signing or migration proof.
The user's public-release authorization is recorded; missing signing credentials,
GitHub billing, cross-platform builds and migration evidence remain factual blockers.
