# Canonical diff WASM tarball delivery repair

Canonical fix: `ed8fae843`, merged and pushed to AX Code main as `fd2a70fb2` under explicit user integration authorization. The isolated clean worktree and merged branch were removed without force after process checks and deletion of only this task's generated dependencies/build output. Desktop has only its canonical main worktree and no stash or additional branch.

The packed package incorrectly declared the bundled private `@ax-code/util` as a runtime dependency. A fresh offline install failed before the fix. Moving it to devDependencies and regenerating the lock makes the existing artifact independently installable. The new CI gate packs and installs with an empty offline store, disables lifecycle scripts, checks public Node exports and strict declarations, and tests installed browser assets in all three engines. No kernel was copied into Desktop and production adoption remains separate.

Validation: 15 WASM tests, 502 root script tests (96 skipped), structure and package typecheck passed. Installed Chromium and WebKit gates passed. Firefox's normal macOS launch failed with a profile-folder error; an isolated CFFIXED_USER_HOME run passed all browser operations, but its outer Python cleanup failed with PermissionError. This is an environment-qualified pass, not a clean default-host run. The owned temporary app-data directory was preserved after the denied cleanup. See https://github.com/microsoft/playwright/issues/42768 for the consistent upstream symptom.

The independent installed candidate again passed 225 Desktop fixtures, 225 full metadata comparisons and 434 hunk revert comparisons. Candidate tarball SHA-256: `f54dc69bda0d81485cef6372cc3d1fa0bcaa4286c276af10b35d812707ed4c25`. Artifact and detailed transient logs remain in `/tmp/ax-diff-delivery-evidence-20261103`.

Muse completed its bounded advisory patch review without a blocker. Grok timed out after 360 seconds; no Grok approval is claimed. Actual receipts are retained here. Package name, private status and production backend selection are unchanged. No standalone package release is claimed by this report.
