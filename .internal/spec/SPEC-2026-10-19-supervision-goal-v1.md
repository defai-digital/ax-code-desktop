# Supervision goal state v1

Status: Accepted for implementation under PRD-2026-10-19-trusted-supervision-v1 (Phase A, item 1).
Depends on: SDK 2.6.37 (`config/ax-code-sdk.json`): `GET /session/{sessionID}/goal` (`session.goal`) and the
`session.goal` event. No runtime change and no new SDK pin.

## Scope

Desktop projects the runtime's durable session goal onto supervision rows, Needs You and the peek. The runtime owns the
goal, its status and its verification. Desktop reads, validates, orders and displays; it never writes a goal, never
changes a status and never decides that an objective was met.

## Data

`lib/supervision/goal.ts` defines `SessionGoalSnapshot` and `normalizeSessionGoal(value)`. A payload is accepted only
with a session id, a non-empty objective, one of `active | paused | complete | blocked | budget_limited`, and a creation
time. Numbers that are negative or not finite are dropped. The objective is cut at 500 characters. A malformed payload is
treated as no goal, never as an error row.

`stores/useSessionGoalStore.ts` holds `goals`, `known` (sessions whose goal is known, including "no goal") and a
per-session `eventSeq`. It is memory only and is not persisted.

- Event writes (`applyEvent`) are authoritative. A null goal clears the entry. A snapshot older than the stored one
  (`updatedAt ?? createdAt`) is ignored; an equal revision replaces.
- Route reads use `beginRead` and `applyRead`. A read is discarded when any event for that session arrived after it began.

## Ingress

1. **Event.** The sync layer's event tap (`sync/sync-context-impl.tsx`, beside the notification dispatch that the reducer
   does not handle) routes `session.goal` events to `useSessionGoalStore.applyEvent` after `normalizeSessionGoal`. The
   reducer, `State`, `prepareEventDraft` and the event-pipeline coalescing are not changed. If the event is dropped before
   the tap by routing or normalisation, the change must route it without altering other event types.
2. **Read.** A hook mounted once with the supervision publisher (`hooks/useSessionGoalsLoader.ts`) reads the goal for
   each row session that is not idle or is displayed, once per session, and again after a reconnect or
   `server.resync_required` recovery. At most 4 reads are in flight. Failures leave the session unknown and are retried
   at most once per recovery. It uses the published SDK client through the existing runtime proxy; no new endpoint.
3. **Cleanup.** `remove` runs when a session is deleted or leaves every directory store, so the map cannot grow without bound.

## Supervision model

- `SupervisionState` gains `goal`: a session whose runtime goal is `blocked` or `budget_limited` and which is not running.
  Precedence: `permission` = `question` > `running` > `error` > `goal` > `review` > `idle` for a session tree
  (`treeStatePrecedence`); urgency: `permission` = `question` (0), `error` (1), `goal` (2), `review` (3), `running` (4),
  `idle` (5). `needsHuman`, `isLiveState` and the work-in-progress counts include `goal`; `isHighTouchState` does not.
- `NeedsYouSessionInput` gains optional `goalNeedsPerson`; `needsYouReason` returns `goal` after `error` and before
  `uncommitted`. `NEEDS_YOU_URGENCY` follows the same order. Callers that do not pass the field are unchanged.
- `deriveSupervisionState` keeps its rule that a running session outranks an unseen error; the same applies to `goal`.
- `SupervisionRow` gains `goal: SessionGoalSnapshot | null`, taken from the root session of the tree.
- A `paused` or `complete` goal is shown on the row but does not change state or raise attention.

## Display

- Mission Control row: under the title, one line with the status label, the objective (single line, truncated with the
  full text in `title`) and, when the runtime reports a budget, remaining tokens or time. No line when there is no goal.
- Needs You entry and peek: the `goal` reason label, plus the same objective line.
- The badge for `goal` has its own label and an accessible name; the status is never conveyed by colour alone.
- Strings exist in all 14 shipped locales. Budget numbers use the existing number and duration formatters.
- The pop-out window renders the same rows from the same store; it needs no separate code path.

## Web document script hashes (PRD item 2)

`collectInlineScriptHashes` moves to `desktop/shared/inline-script-hashes.mjs` and is imported by
`desktop-renderer-protocol.js` with identical behaviour and unchanged tests. The web server computes the hashes of every
inline `<script>` in the HTML documents it serves for the app (`index.html`, `mini-chat.html`, `supervision.html`) and
`buildWebServerCsp` emits `script-src 'self' 'wasm-unsafe-eval' <hashes>` for them, with no `'unsafe-inline'`. Hashes are
computed from the served bytes and cached by file modification time. Preview and dashboard proxy responses keep the
previous policy. `connect-src` is unchanged.

## Tests

Pure normalisation and the store (done). Reducer-independent event ingress including a null goal, a malformed payload
and an out-of-order snapshot. The loader's concurrency bound, once-per-session rule, retry rule and recovery refresh.
State derivation and ranking with a goal, with a running session, and with a mix of reasons. Row construction. Row, peek,
badge and Needs You rendering including the accessible names. A locale completeness check. CSP: every inline script in
each served document has a hash in the policy, and a changed script changes the hash.
