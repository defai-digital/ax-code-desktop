# Public Signed Shadow Retry

Actions run 38194612539 actually started at commit 6df2a8f0. Job 114634431835
failed in the visibility guard: CONFIRM_SHADOW_ONLY=true, REPOSITORY_VISIBILITY=public.
No credential preflight or package job ran. The repository API independently reports
PUBLIC. GitHub billing was not the observed blocker in this attempt.

Updated the access policy to allow explicitly acknowledged public required-signature
runs while rejecting public unsigned mode and unknown visibility. Added per-job
Minisign before every staged package upload; Apple notarization and Windows audits
remain intact. Official publication stays disabled. Work was isolated from concurrent
manifest/runtime fixes in the main checkout using a separate Git worktree.

Local verification: 120 root script tests passed, four skipped (PowerShell unavailable).
All repository boundaries, actionlint, Node/Bash syntax and Git whitespace checks
passed. Access-policy regressions reject unsigned public candidates; workflow
contracts ensure signatures precede every staged native/web upload. Validation ran
against a clean committed dependency-fix baseline 1fd13452 in the isolated worktree.
