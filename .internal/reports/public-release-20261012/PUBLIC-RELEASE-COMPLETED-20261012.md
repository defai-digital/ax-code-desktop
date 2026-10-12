# Desktop v7.24.5 Public Release Completed

Published release: https://github.com/defai-digital/ax-code-desktop/releases/tag/v7.24.5

The public tag resolves to the qualified source `d6bd460b51bbd92021792fd16ba5ddf951a8a96a`. Desktop CI 38206392452, CodeQL 38206392435, Code Quality 38206392949, and required Desktop Shadow 38206393629 all passed on that exact source. Four native installer targets passed fresh installation, baseline installation, upgrade, rollback and final candidate installation. Apple Developer ID signing, notarization/stapling, Azure Authenticode timestamps, pinned Minisign signatures, candidate installed ASAR smoke and SHA-256 evidence were independently verified.

The Windows failure in job 114666585577 was Git Bash reporting an NTFS private key as POSIX mode 644. Native owner-only NTFS ACL protection and verification now fail closed on inherited access, foreign grants and reparse points. Windows CI passed real ACL regressions, ASAR layout/block-integrity checks and complete signed native installation qualification.

The continuity receipts cover preservation of existing profile and synthetic provider configuration bytes. Candidate installed ASAR CLI/UI smoke ran after candidate installs. The 7.10.2 baseline was installed but not executed. This is not evidence for historical GUI database migration or real-provider authentication. The baseline fixture release remains an unpublished draft.

All 66 initial GitHub release asset sizes and server SHA-256 digests matched the verified local files. Four updater feeds and seven referenced asset SHA-512 digests passed; the anonymous updater resolves v7.24.5. Additional signed R2 staging and public cutover receipts accompany the release.

Both macOS installers exceeded the guarded REST upload size. Qualified native R2 multipart uploads used 32 MiB parts with pinned size/SHA-256 checks, an isolated capability-authenticated temporary Worker, immutable collision refusal, abort on failure and complete authenticated byte readback. The temporary Worker was removed. The reusable `stage-multipart` operator is committed after the release source without changing signed installer bytes. Root script tests passed: 136, with six Windows-only skips locally; the complete boundary suite and syntax checks passed.

Cloudflare Worker `ax-code-desktop-downloads` version `540704c3-6594-4754-b712-5cccd128402d` serves the independent Desktop route and bucket. All 48 anonymous release/pointer/bootstrap objects matched qualified bytes after activation. The installer returned HTTP 200, its pinned Minisign signature verified, and latest.txt returned v7.24.5. Existing AX Code CLI installer availability was independently confirmed. The AX Code repository was not changed.

Qualified outputs and receipts are preserved under `/Volumes/home-1/ax-code-desktop-release-20261012/run-38206393629/`. Owned temporary branches/worktrees and the upload Worker were removed. The release does not install or replace the user's local application.
