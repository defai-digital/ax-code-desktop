# Supervision v3: pop-out window and stable multi-run identity

Status: Accepted. Authorized for implementation by the user's 2026-10-19 instruction to continue Phase 2 of
PRD-2026-10-19-competitive-quality-v1 (items 11 and 12).
Related: PRD-2026-10-15-supervision-workspace; PRD-2026-10-18-supervision-usability-v1; ADR-002; ADR-005.
Specifications: SPEC-2026-10-19-supervision-popout-v1; SPEC-2026-10-19-multirun-identity-v1.

## Problem

Mission Control lives inside the main window, so a user who supervises many projects loses it whenever they open a
session. Orca and Hermes Agent keep a detachable supervision window. Separately, multi-run comparison groups lanes by
parsing session titles, which breaks when a lane is renamed or two launches share a name, although the runtime already
validates a structured `multiRun` session metadata namespace.

## Requirements

1. **Pop-out window.** Mission Control can open in its own window from its header and from the command palette. One
   supervision window exists at a time; asking again focuses it. It shows the same rows, states, working sets, density
   and request actions as the in-window board, from the same runtime projections. Opening a session from the pop-out
   focuses the main window and opens the session there through the existing main-window handoff. Closing the pop-out
   never closes or changes the main window.
2. **No new state owner.** The pop-out is a view. It adds no runtime endpoint, no new persisted store and no second
   desired-state engine (ADR-005 stays deferred). Shared preferences (density, working sets) stay in the existing store.
3. **Stable multi-run identity.** New multi-run lanes record `metadata.multiRun` (`groupId`, `variantId`, and when known
   `model`, `agent`, `worktree`) through the published SDK session update. Grouping prefers that metadata and falls back
   to title parsing only for sessions without it, so existing groups keep working.
4. **Accessibility and locales.** New controls have accessible names, keyboard access and strings in every shipped
   locale.

## Non-goals

Lane actions (keep, archive, ask other models), code-aware fusion, remote or mobile supervision, and any runtime change.

## Acceptance

- Unit tests cover the window factory and IPC command, the single-instance rule, the pop-out open-session handoff,
  metadata writing on launch, metadata-first grouping with title fallback, and malformed metadata.
- The end-to-end harness opens the pop-out and checks it renders the board.
- Typecheck, lint, tests, build, locales and boundary checks pass.
