# Desktop end-to-end harness v2

Status: Accepted for implementation under the user's 2026-10-19 instruction to improve testing and CI/CD in AX Code and AX Code Desktop.
Extends: SPEC-2026-10-19-desktop-e2e-harness-v1. Preserves its isolation, dependency, platform and release policies.

## Changes from v1

1. Run CSP and uncaught-exception checks after user journeys. Retain CSP violations through a CDP runtime binding so a reload cannot erase earlier failures.
2. Exercise a real document reload, wait for a new `performance.timeOrigin` and app shell, verify the sandboxed preload bridge, focus the main window, and reopen Settings with the keyboard. Bringing the main page to the front is part of keyboard setup after a supervision pop-out.
3. Record uncaught exceptions from the main renderer and the supervision window while its journey is attached. Ordinary console and network messages remain diagnostics; this contract does not equate every console error with an uncaught exception.
4. Retain each journey's duration and screenshot, plus the existing aggregate results, stdout, stderr and console events.
5. `pnpm run e2e:desktop:self-test` deliberately produces a blocked script and uncaught exception in the real isolated renderer, then reloads it. It succeeds only if the harness rejects both failures after reload. The forbidden script uses an origin excluded by the existing CSP, so it requires no external server.
6. CI retains successful as well as failed E2E artifacts for three days, and publishes the actual step outcomes for unpackaged, packaged and self-test runs. These steps remain advisory during the v1 two-week hosted qualification period. This change does not promote them to merge or release gates.

## Required result aggregation

Desktop CI exposes `Desktop required checks` after the changes, verify, native and packaged jobs settle. It rejects a failed classifier, missing/invalid scope output, and any selected job whose result is not `success`. A skipped job is accepted only when the classifier explicitly disabled that job. Documentation-only changes still produce a successful aggregate after the classifier succeeds.

The aggregate's workflow implementation does not configure GitHub branch protection. Existing signed release, inventory, installation, upgrade, rollback and explicit publication approval requirements continue to apply.

## Limits

The runtime remains a local stub. These journeys do not qualify real provider calls, end-to-end permission approval, runtime session streaming, visual parity, or a new signed release. CSP event history covers the main page; supervision exception observation covers the period attached by its journey.
