# Desktop Public Release Progress

The user authorized public Desktop release on 2026-10-12 UTC and explicitly required
Minisign, Apple signing/notarization, and Windows signing. This approval does not
claim that an exact candidate has passed all native installation/migration gates.
The existing publication policy stays disabled until verified signed artifacts are
ready. No unsigned or ad-hoc-signed package may be publicly published.

Live checks confirmed a valid local DEFAI Developer ID identity and access to the
`ax-notary` notarization profile. Azure certificate metadata confirms the frozen
Windows certificate is enabled and valid through July 2027. Private key material
was not fetched or written into this report.

GitHub Actions run 38187642298, job 114613334982, did not start because the account's
payment or spending limit blocks execution. Apple/Azure credentials are absent from
Desktop repository-secret metadata and no environment is configured. Billing must
be restored externally, and the signing credentials made available securely, before
the required cross-platform workflow can run. Do not put credentials in chat or
increase spending limits automatically.

Local validation found an ASAR test-fixture race: the pinned archive writer resolves
with a stream before the final bytes flush. Commit 7f7aa348 waits for stream completion
before integrity verification. All 456 Electron tests subsequently passed. The full
local test counts and signing progress are recorded in `status.json`; ignored raw
logs are retained locally beside this report. Windows bootstrap tests remain skipped
when PowerShell is absent; no mock test is native Windows qualification.

## Completed local macOS signing

The signed local candidate was built from 7f7aa348 with the frozen SDK 2.6.7 and
signed runtime 7.24.4. Apple accepted the application submission and the independently
signed DMG submission; stapled tickets, Developer ID and Gatekeeper checks passed.
The DMG, ZIP, both blockmaps and refreshed latest-mac.yml have verified Minisign
signatures with the pinned release key. Hashes are recorded in status.json.

The packaged startup/crash-recovery smoke and real bundled-runtime phase passed
using an isolated disposable profile. This does not qualify upgrade, rollback or
credential continuity. No installer was placed in /Applications or publicly uploaded.

A second verification defect was corrected: the integrity checker ignored
electron-builder's output directory override and could inspect an older dist
package. It now honors explicit relative/absolute output paths. All 457 Electron
tests and all repository boundaries passed. Generated packages are retained under
the ignored root .internal/releases directory. Public release remains incomplete
because cross-platform signing/qualification is blocked by GitHub billing and
unconfirmed CI credential availability.
