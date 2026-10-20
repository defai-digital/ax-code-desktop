# Scripted-session end-to-end journeys (2026-10-19)

Status: Evidence for SPEC-2026-10-19-desktop-e2e-journeys-v1 and PRD-2026-10-19-trusted-supervision-v1 (Phase B item 5).

## What landed

A scenario-driven stub runtime and three journeys, opt-in with `pnpm run e2e:desktop -- --scripted`:

- `needs-you-approve` and `needs-you-deny`: a pending permission for a scripted session appears on the pop-out board, a click
  answers it, the stub logs every reply attempt (exactly one, `once` or `reject`, with the directory the renderer actually
  sent), and the request clears from the pop-out and the main window.
- `goal-row`: a `session.goal` event for the scripted session renders the Blocked row with the objective and budget in the
  pop-out; a goal for another session does not change it; a later revision of the target goal renders afterwards (the
  event stream is ordered, so that proves the foreign frame was handled).

The default run is unchanged (boot, preload bridge, settings, pop-out, reload, then the CSP and exception checks). The scripted
journeys are not in it because they do not pass reliably yet.

## Findings

1. **The Settings window crashed against the stub runtime.** `Cannot read properties of undefined (reading 'supported')` in
   `SettingsWindow`, present before this work (`40fd9ab4`). The AX Engine status response was used without checking its shape.
   `fetchAxEngineModels` now rejects an incomplete response as a load error, which the providers and Local Models pages already
   handle. The `renderer-errors` check did not report it because React's error boundary catches the exception and only logs it.
2. **The seeded project path must be a real path.** macOS temporary directories are links (`/var` to `/private/var`); the app
   resolves directories before it talks to the runtime, so a stub that compares strings answered every directory-scoped list
   with an empty array. The launcher now seeds real paths.
3. **The unpackaged app activates its own directory as a project.** In some runs the active project is `desktop/packages/electron`
   instead of the seeded one (the persisted `activeProjectId` is overwritten). Setting the app's working directory did not stop it.
4. **Open question, possibly a product defect.** When the active project differs from the request's project, the approve and
   deny replies sometimes went out with the active project's directory instead of the request's. The journeys catch this because
   they record the directory the renderer sent. In the same situation the main window's Needs you count and the revised goal
   objective did not update. It is not established whether this is the harness (a stub that emits events before the renderer has
   loaded the seeded project) or the product (pop-out or main window resolving a non-active project's request through the active
   directory). `respondToPermission` resolves the directory from the request's store, then the session, then the active
   directory, so the fallback is the suspect. Needs a focused reproduction with two real projects.

## Reliability

Nine scripted runs after the real-path fix: `goal-row` passed 7, `needs-you-deny` 5, `needs-you-approve` 3. Failures cluster in the
runs where the app activated its own directory. The host was heavily loaded (load average 100 to 230), which also makes the
existing keyboard journeys fail intermittently (`settings` and `reload`: "main window focus" or "settings view" timeouts),
before and after this change. These counts are observations, not a measured rate.

## Not covered

A real runtime, real permission prompts, worktree creation (deferred to the runtime-owned worktree work), the packaged app,
Windows and Linux.
