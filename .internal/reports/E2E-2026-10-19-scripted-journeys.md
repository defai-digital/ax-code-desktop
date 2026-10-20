# Scripted-session end-to-end journeys (2026-10-19)

Status: Evidence for SPEC-2026-10-19-desktop-e2e-journeys-v1 and PRD-2026-10-19-trusted-supervision-v1 (Phase B item 5).

## What landed

A scenario-driven stub runtime and three journeys in the default `pnpm run e2e:desktop` run:

- `needs-you-approve` and `needs-you-deny`: a pending permission for a scripted session appears on the pop-out board, a click
  answers it, the stub logs every reply attempt (exactly one, `once` or `reject`, with the directory the renderer actually
  sent), and the request clears from the pop-out and the main window.
- `goal-row`: a `session.goal` event for the scripted session renders the Blocked row with the objective and budget in the
  pop-out; a goal for another session does not change it; a later revision of the target goal renders afterwards (the
  event stream is ordered, so that proves the foreign frame was handled).

## Findings

1. **The Settings window crashed against the stub runtime.** `Cannot read properties of undefined (reading 'supported')` in
   `SettingsWindow`, present before this work (`40fd9ab4`). The AX Engine status response was used without checking its shape.
   `fetchAxEngineModels` now rejects a response without `eligibility.supported` as a load error, which the providers and Local
   Models pages already handle. The `renderer-errors` check did not report it because React's error boundary catches the
   exception and only logs it.
2. **The seeded project path must be a real path.** macOS temporary directories are links (`/var` to `/private/var`); the app
   resolves directories before it talks to the runtime, so a stub that compares strings answered every directory-scoped list
   with an empty array. The launcher now seeds real paths.
3. **The unpackaged app activates its own directory as a project.** In some runs the active project is `desktop/packages/electron`
   instead of the seeded one (the persisted `activeProjectId` is overwritten). Setting the app's working directory did not stop it.
4. **The wrong-directory replies were a stub defect, not a product defect.** An earlier draft of this report suspected that
   `respondToPermission` sent replies with the active project's directory. The cause was the stub: `GET /permission` ignored
   the requested directory and returned the pending request for every project the app bootstrapped, so the request landed in the
   decoy project's store and the reply correctly used that store's directory. The real runtime keeps pending permissions per
   directory instance. The stub now filters by the `directory` query or header (covered by a test that fails without the
   filter). The same defect explained why the main window's Needs you count and revised goal objective did not update in those runs.

## Reliability

Before the stub fix (nine runs): `goal-row` passed 7, `needs-you-deny` 5, `needs-you-approve` 3, failing in the runs where the app
activated its own directory. After it, nine consecutive runs passed all three journeys (six with the journeys opt-in, three in the
default run), including the runs where the app's own directory was the active project. The host was heavily loaded (load average
100 to 240) throughout.

The default run still fails intermittently on journeys that depend on window focus: `settings` and `reload` ("settings view" or
"main window focus" timeouts) and, under load, `supervision-popout`. These failed before this work (at `40fd9ab4` too) and are
not addressed here. Counts are observations from one machine, not a measured rate.

## Not covered

A real runtime, real permission prompts, worktree creation (deferred to the runtime-owned worktree work), the packaged app,
Windows and Linux.
