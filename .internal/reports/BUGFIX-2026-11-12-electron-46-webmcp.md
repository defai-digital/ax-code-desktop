# Electron 46 process and WebMCP race fixes

Date: 2026-11-12.
Baseline: `1191633d16711cb6e31ffa830d041419e3cc452a` after integrating upstream Desktop 7.30.20.
Authorization: The user requested Electron 46/WebMCP bug investigation, fixes, tests, and commit; the preceding push request remains active.
Status: Two reproduced defects fixed; workspace and packaged macOS arm64 verification passed.

## Stalled utility processes survive nominal force termination

Electron 46 changed `UtilityProcess.kill()` to deliver SIGTERM on POSIX without an automatic force-kill fallback.
The method accepts no signal argument. Desktop passed `"SIGKILL"` at the shutdown deadline and used `kill()` for
failed-boot cleanup. A server that handles or ignores SIGTERM could therefore survive either path, retaining its
port and state while supervision moved on. An IPC send failure also resolved shutdown immediately after SIGTERM.

A real `46.0.0-alpha.9` child with a SIGTERM handler survived `child.kill("SIGKILL")`, reported that it handled
SIGTERM, and exited only after `process.kill(pid, "SIGKILL")`. The retained
[pre-fix native observation](electron-46-20261112/utility-kill-before.json) records that result.
See the [upstream behavior change](https://github.com/electron/electron/pull/53992) and the installed exact-version types.

Extract the existing parent-side shutdown driver into `utility-process-stop.js`. Graceful shutdown retains its stop
message and SIGTERM stage; deadline escalation and failed-boot cleanup send SIGKILL to the handle's current valid PID.
Handles without a current PID retain Electron's native kill fallback. Shutdown keeps its escalation timer when the
IPC channel is unavailable, and clears timers and its exit listener after completion. Synchronous exit while sending
SIGTERM cannot install a stray force-kill timer. Unexpected force-stop errors produce a fixed diagnostic without raw
native exception data; an already-gone PID is benign.

The existing native compatibility smoke now starts a real utility child that ignores shutdown IPC and SIGTERM,
uses the same parent driver as the application, and requires the child to exit. POSIX also requires the OS force-kill
path to have been exercised. Cleanup is bounded by the smoke's existing external watchdog.

## An unrelated response overwrites an early WebMCP completion

`WebMCP.toolResponded` can precede the `WebMCP.invokeTool` acknowledgement that supplies the invocation ID. The adapter
kept only one early response. If the current call completed and an older call then responded before acknowledgement,
the older response replaced the valid result. The acknowledged call no longer found its completion and remained busy
until timeout. The same sequence lost a cancellation acknowledgement and reported unconfirmed stopping.

Buffer early responses by invocation ID, with a maximum of 16 capped results. The native acknowledgement selects its
own result and clears the buffer. Unrelated completions cannot replace the matching buffered completion. The normal
result-size limit and same-document busy guard continue to apply.

Regression coverage includes completion followed by an older response, a burst of oversized unrelated responses,
and cancellation completion followed by an older response. Utility tests cover the actual no-signal-argument API,
failed-boot cleanup, closed IPC, synchronous exit, listener/timer cleanup, missing current PIDs, and fixed diagnostics.
The first regression run against the extracted original behavior failed five assertions; the focused five-file run
then passed all 351 tests. The real engine smoke also passed 14 locale menus, a PTY round trip, and utility-process stop.

## Final verification

- All six root gates passed: `check:boundaries`, `check:locales`, `typecheck`, `lint`, `test`, and `build`.
- Full test suite: 9,524 passed and 12 skipped on the integrated Desktop 7.30.20 tree.
- Focused WebMCP, utility-process, page, browser, and supervision tests: 351 passed.
- Real Electron 46 native compatibility smoke passed 14 locale menus, a PTY round trip, and termination of the
  utility process that ignores IPC shutdown and SIGTERM.
- Native WebMCP feature-disabled, enabled, and enabled-repeat smokes passed.
- Unsigned macOS arm64 packaging passed with `--publish=never` and the verified pinned runtime required.
  ASAR integrity, Electron fuses, and the 13 direct runtime dependencies passed packaging checks.
- Packaged app and bundled AX Code 7.30.24 runtime smoke passed. All 10 packaged E2E checks passed, including
  preload isolation, supervision, reload, approval/denial, goal revisions, CSP, and renderer exception checks.

Retained evidence: [workspace gates](electron-46-20261112/bugfix-workspace-gates.json),
[native compatibility](electron-46-20261112/bugfix-native-compatibility.json),
[native WebMCP](electron-46-20261112/bugfix-native-webmcp-summary.json),
[packaged smoke](electron-46-20261112/bugfix-packaged-smoke.txt), and
[packaged E2E](electron-46-20261112/bugfix-packaged-e2e-results.json).
Full logs and screenshots are under `/tmp/ax-desktop-electron-46-bugs-20261112`.

Public release remains disabled (`shadow-only`). Local macOS qualification does not establish Windows/Linux execution,
production signing, upgrade/rollback qualification, or a performance improvement.
