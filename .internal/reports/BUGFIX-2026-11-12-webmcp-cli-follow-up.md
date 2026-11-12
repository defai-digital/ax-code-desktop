# WebMCP and Electron 46 CLI-assisted follow-up

Date: 2026-11-12.
Baseline: `5714e24faabcb100b78f0e33b57e4a9bc55ed35e` (Desktop 7.30.20, Electron 46.0.0-alpha.9).
Authorization: The user requested work with Grok CLI and Muse CLI to find and fix related bugs, test, and commit.
Status: Two new defects reproduced and fixed; all root gates and local macOS arm64 packaged checks passed.

## Reviewer workflow

The initial common packet contained line-numbered current sources and the exact engine/runtime context, including
the previous fixes and safety boundaries. Grok 1.0.77 and Muse Code 1.4.15 ran with tools and delegation disabled;
Muse also had shell and filesystem writes disabled. Reviewers could advise but could not modify the checkout.
Only final answers and usage/exit receipts are retained; raw transport and reasoning remain outside the repository.

Muse completed its initial review and a challenge round. Its failed-initialization finding was reproduced with both
a deterministic test and an actual Electron guest. The challenge round withdrew three claims after seeing the
existing close-confirmation tests, the cancellation exclusivity invariant, and the all-document authorization pass.
The primary agent independently reproduced the pre-spawn utility-process defect and asked Muse to review the repair.
Grok authentication/model listing worked, but six bounded inference attempts produced no answer. Narrower packets,
the available fast model, an isolated leader socket, explicit single-turn mode, and TTY input did not recover inference.
No unsuccessful call is counted as a finding. The [consultation records](../reviews/webmcp-electron-46-2026-11-12/README.md)
retain both Muse answers and usage receipts, the Grok attempt statuses, and source hashes.

## Confirmed defect: force stop before spawn is lost

Electron returns a utility-process handle before `pid` exists. The old helper fell back to `child.kill()` and forgot
the stop request when that method returned false. A subsequently spawned process then survived outside supervision.
The real baseline probe observed an undefined initial PID, a false stop result, a later ready message, and a live child.

Remember a pending force stop by child handle in a weak map. On spawn, remove its pending listeners and force-stop
that same handle using its current PID. Exit before spawn retires the request. Repeated requests share one pending
registration, and an immediate force stop after PID assignment also removes the deferred registration.
The updated real-engine compatibility smoke requires a child stopped immediately after fork to exit.

## Confirmed defect: failed native setup leaves a hidden retained page

If a loaded guest vetoed cleanup after native initialization failed, `create` rejected but retained its not-ready
entry in the live pool. The page was absent from the ready-only list, so the caller could neither address its manual
controls nor close it normally. Repeating create reused the failed entry without retrying native startup.

When cleanup is vetoed and the guest remains alive, stop the partial adapter and retain the page as an addressable
manual pane. Its safe `operation-failed` status and `nativeAvailable: false` prevent agent work. The normal profile
ownership registration still runs, and an explicit confirmed close or storage clear permits a fresh create.
Ordinary startup failures whose guests close successfully still clean up and reject as before.

Actual Electron observations before and after the repair kept the guest alive in both cases. The baseline rejected
creation and listed zero panes while retaining one live entry; the repaired version returned the pane ID, listed
one pane, and reported native access unavailable. The native WebMCP smoke now exercises retention, listing, explicit
close confirmation, and final disposal using a controlled initialization failure and a real beforeunload veto.

## Findings not adopted

- Close confirmation across same-WebContents navigation is intentional and explicitly tested; replacement contents
  trigger a further prompt. Requiring a new navigation-generation approval would change that policy.
- An unconfirmed cancellation retains exclusivity because page work may still run. A time-only purge could admit
  overlapping execution. Generic debugger rejection is not sufficient proof that dispatch never happened.
- The proposed popup partial-close finding omitted the existing all-document non-destructive authorization pass;
  no concrete unapproved-work discard was reproduced. Atomic closure across arbitrary WebContents is not assumed.

## Verification

The two key regression tests failed against the baseline behavior. The focused four-file suite passed 308 tests after
the repair. All six root gates passed: `check:boundaries`, `check:locales`, `typecheck`, `lint`, `test`, and `build`.
The full suite passed 9,527 tests with 12 skipped. Real native compatibility and all three native WebMCP smoke variants
passed, including pre-spawn force stop and the new initialization-veto recovery assertions. Unsigned macOS arm64
packaging, ASAR/fuse checks, bundled runtime 7.30.24 startup, and all 10 packaged E2E checks passed.

Retained receipts: [workspace gates](webmcp-cli-20261112/workspace-gates.json),
[native compatibility](webmcp-cli-20261112/native-compatibility.json),
[native WebMCP](webmcp-cli-20261112/native-webmcp-summary.json),
[packaged smoke](webmcp-cli-20261112/packaged-smoke.txt), and
[packaged E2E](webmcp-cli-20261112/packaged-e2e-results.json).
The real-engine defect observations are retained [before](webmcp-cli-20261112/pre-spawn-before.json) and
[after](webmcp-cli-20261112/pre-spawn-after.json) the process fix, and
[before](webmcp-cli-20261112/init-veto-before.json) and [after](webmcp-cli-20261112/init-veto-after.json) page recovery.

No public release is authorized; the candidate remains shadow-only. These local checks do not establish Windows/Linux
execution, production signing, upgrade/rollback qualification, or performance gains.
