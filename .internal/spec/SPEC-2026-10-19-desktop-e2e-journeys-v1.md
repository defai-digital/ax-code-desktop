# Desktop end-to-end journeys v1: scripted session, approve, deny and goal row

Status: Accepted for implementation under PRD-2026-10-19-trusted-supervision-v1 (Phase B item 5).
Extends: SPEC-2026-10-19-desktop-e2e-harness-v2. Preserves its isolation, dependency, platform, CSP and release policies.
The refused-worktree journey in the PRD is deferred: Desktop still creates worktrees itself, and the journey belongs with
the runtime-owned worktree work (PRD Phase B item 9).

## Why

The harness boots the real renderer against an empty stub runtime. No journey proves that a person can approve or deny a
request, that the runtime receives the answer, or that a goal event reaches Mission Control. The goal ingress has no unit
test through the real event handler, so a journey is the only place that wiring is exercised.

## Scripted stub runtime

The stub gains an optional scenario, written as JSON by the launcher next to the stub and read from a path in the
environment of the stub process. Without a scenario the stub behaves exactly as today.

A scenario describes: one project directory (a temporary directory the launcher creates and seeds into the isolated
profile's settings), one root session in it, an optional pending permission request for that session, and an optional goal.
The stub serves them through the routes the renderer already uses: the session list routes for that directory, the pending
permission list, `GET /session/{id}/goal`, and `POST /permission/{requestID}/reply`.

- A reply is appended as one JSON line (`requestID`, `reply`, optional `message`, `directory`) to a file in the launch's
  temporary directory, removes the request from the pending list, and emits `permission.replied` on the event stream.
- The event stream emits each scenario step as `{directory, payload}` frames after the client connects: `permission.asked`
  for the pending request and `session.goal` when the journey asks for it. A journey can also request an emission through
  a stub-only route that exists only when a scenario is loaded.
- The stub never validates credentials, never calls a model and never writes outside its temporary directory.

## Journeys

Each journey asserts both the interface and what the runtime received.

1. **Needs You approve.** The session appears with a pending permission; Mission Control (or the Needs You surface) shows
   the request; activating the approve control sends exactly one reply `once`, the stub file records it, the request leaves
   the interface, and the row no longer shows a permission state.
2. **Needs You deny.** Same path with the deny control; the recorded reply is `reject`.
3. **Goal row.** After the stub emits `session.goal` (blocked, with a budget), Mission Control shows the "needs you" goal
   row with the status label, the objective and the budget text. A goal for another session does not change this row.

Journeys run after the existing ones and before the final checks, so the CSP and uncaught-exception checks cover them.
Each journey leaves the profile reusable by the next one (its own scenario step, no shared mutable state).

## Limits

The runtime is still a stub. These journeys do not qualify real provider calls, a real runtime goal, worktree creation,
packaged-app behaviour beyond what the harness already covers, or Windows and Linux rendering. They do not become a merge
or release gate under this specification.

## Tests

Pure scenario building and the stub's reply recording run without Electron. The journeys run through
`pnpm run e2e:desktop` and appear in its results and artifacts like the existing ones.
