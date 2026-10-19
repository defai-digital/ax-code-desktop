# Event-queue pressure, rejected shedding, and seeded state-machine tests

Date: 2026-10-19. Baseline: `fc0adaaf`. Follows the 2026-10-18 hot-path report and the same-day
[open-paragraph trace](PERFORMANCE-2026-10-19-open-paragraph-trace.md).

## Outcome

| Follow-up from the 2026-10-18 report                       | Result                                                                                                         |
| ---------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------- |
| Replace the 512-event synchronous drain                    | Shipped a lossless, one-slice drain. A shedding + scoped-snapshot design was built, reviewed and **rejected**. |
| Break down the renderer cost of a long open paragraph      | Measured; the pre-registered rule says no DOM change. Details in the trace report.                             |
| Property or golden-trace tests for `ui/src` state machines | Shipped a dependency-free seeded runner and five model tests, each proven with a mutation probe.               |

Rust remains out of scope (2026-10-15 decision, unchanged).

## 1. High-water drain

### What shipped

`enqueueEvent` in `desktop/packages/ui/src/sync/event-pipeline.ts` used to call `flushDir(directory, true)` once 512 events were
pending, dispatching the whole backlog inside one transport callback. It now calls `flushDir(directory)`: one bounded slice (at most
128 events or 8 ms, always at least one event) with the remainder rescheduled by the existing `setTimeout(0)`. Nothing is dropped,
no snapshot is requested, ordering and removal barriers are unchanged, and `flushAll()` on connect and on cleanup stays synchronous.
Because every enqueue past the mark dispatches at least one event, pending cannot grow while arrivals are one event per callback.
A 2,048-event hard cap keeps the old synchronous drain as a last-resort memory bound for re-entrant enqueues.

### Measured

A synchronous burst of 1,200 distinct events (`event-pipeline-cooperative-drain.test.ts`): the largest number of events dispatched
inside one enqueue callback is 512 with the old behaviour (observed by reverting the change as a mutation probe) and at most 128 now.
At the 0.2 ms handler cost used by the benchmark, 512 events is about 100 ms of synchronous work in one callback; one slice is
bounded by the 8 ms budget. This counts events per callback; it is not a measured frame or input-latency improvement.

### How much it matters

Reviewers pointed out, and the benchmark confirms, that the SDK SSE adapter already yields about every 8 ms and one WebSocket message
is one task, so the 512 mark is reached mainly by synchronous bursts such as a reconnect replay. This is a safety bound, not a
throughput win for ordinary streaming. The benchmark case added to `event-pipeline.bench.ts` reports steady-state block size only
(40 events, 8 ms through the SSE path) and is not a before/after.

### Rejected design: shed droppable events and request a scoped snapshot

An implementation (about 530 added lines) discarded `message.part.delta` and non-final `message.part.updated` at the high-water
mark, armed the affected sessions, dropped further in-window part events until a scoped snapshot settled, and wired an `onShed`
callback to `triggerDirectorySnapshotRecovery`. Independent reviews by muse and codex (read-only, with traces) found, and the
implementer's own report acknowledged part of:

- **Permanent truncation.** Renderer has `"A"`; a burst arms the session; the snapshot request captures `"AB"`; the delta `"C"` and the
  FINAL text update `"ABC"` arrive while armed and are dropped; `message.updated(completed)` and `session.idle` survive; the snapshot
  installs `"AB"`; the armed state clears and nothing re-arms. The transport cursor had already advanced, so the events are not replayed.
- **Snapshot coverage was assumed, not known.** The pipeline approximated the snapshot's 30-message window from the message ids it had
  seen. If the server holds more messages than the pipeline saw, a dropped update outside the real window is never repaired.
- **In-flight recovery made it a no-op.** When a recovery was already running, `onShed` resolved immediately, so the shed round was lost.
  The stale-session result type existed in the contract but production could not fill it.
- **Snapshot materialization could resurrect a part removed after the request was sent.**
- **Armed state could survive a reconnect**, and the per-session message-id map was never pruned.
- Tests did not cover those paths, and two of three sampled guards could be deleted without a failure.

The simpler lossless design removes the long callback without any of these risks. Shedding would only help if processing were
permanently slower than arrival, and no report shows that: the 2026-10-19 trace holds p95 at the display floor even at about
8,000 characters per second. If sustained overload is ever demonstrated, the 2026-10-18 recommendation stands: transport-level
backpressure or an authoritative resynchronization that is itself proven not to lose final content, not ad hoc discarding.

### Review receipts

| Reviewer | Target               | Outcome                                                                                                                     |
| -------- | -------------------- | --------------------------------------------------------------------------------------------------------------------------- |
| grok     | plan (all items)     | Corrected the brief: `server.resync_required` is a full reboot, not a scoped snapshot; cursor advances before delivery      |
| muse     | plan (all items)     | Agreed on the split; proposed the same lossless alternative as a fallback                                                   |
| grok     | WP-A implementation  | Built the shedding design; documented its own stale-snapshot gap                                                            |
| muse     | WP-A review          | Confirmed truncation trace; recommended deleting the shed path                                                              |
| codex    | WP-A review          | Confirmed truncation, coverage and resurrection defects; recommended the lossless design                                    |
| muse     | WP-A2 implementation | Lossless one-slice drain with mutation proof                                                                                |
| grok     | WP-A2 review         | Ship; no product defect. Found the new test did not lock the change and did not cover a queued pre-removal slot; both fixed |
| muse     | WP-C implementation  | Five models, two claimed bugs                                                                                               |
| codex    | WP-C review          | Several oracles shared code with the implementation; both claimed bugs were not product bugs                                |
| muse     | WP-C round 2         | Independent oracles and mutation probes                                                                                     |

A mutation probe of the post-review barrier test showed the first version of that test did not detect the removed barrier (it placed
the pre-removal event where no coalescing index could merge it); it was repositioned and now fails under the mutation.

## 3. Seeded state-machine tests

`desktop/packages/ui/src/test/prng.ts` adds a dependency-free runner: mulberry32 PRNG, a property runner with greedy shrinking (sync and
async, object traces), failure messages with `seed=<n>`, the minimal trace and a replay hint, and `SYNC_PROP_SEED` to replay one seed.
`fast-check` is not installed and adding it would change the frozen lockfile.

Model tests, each below 2 s:

- `event-reducer.model.test.ts`: an independent reference model (session to messages to parts with text and offsets) compared with the
  reducer, including replayed and gapped delta offsets, final tool states, removals, archive and `sessionTotal` membership.
- `soft-removal.model.test.ts`: fake timers, failed commit, undo, quit recovery, and a removal arriving while a recovery is in flight.
- `reconnect-recovery.model.test.ts`: snapshot-versus-live arrival order with an independent equality check, and candidate discovery that
  includes sessions whose last assistant message is incomplete.
- `useQueuedMessageAutoSend.model.test.ts`: drives three pure decision functions extracted from the hook (behaviour identical, the hook
  calls them) across competing windows, abort during a retry, and deferred-edge preservation.
- `session-actions.model.test.ts`: the shared status stamp across sessions and eviction, and the optimistic-send rollback predicate.

Mutation probes (each failed with a printed seed, then was reverted): archived `sessionTotal` decrement made unconditional (seed 170);
removing a message without its part bucket (123); removing deferred-edge preservation (906); removing the reconnect staleness guard
(601, 702); deleting incomplete-message candidate discovery (exact-set assertion); a per-session stamp counter (1003); a recovery that
overwrites a whole soft-removal slot (1202).

Two findings from the first round were withdrawn after review. A late part for a removed message is intentionally buffered and
materialization-requested by the reducer. Two `session.created` events for one id cannot occur because the server publishes creation
only after a primary-keyed insert. The model now asserts the reachable invariants instead.

Not covered: the event-pipeline coalescing equivalence (covered by the existing golden traces), reducer inputs that carry permissions,
questions or optimistic parts, and the integration of `sync-context-impl.tsx` (17 fixes since mid-September) with these models.

## Validation

- `pnpm --dir desktop/packages/ui run test`: 538 files, 3,488 tests passed.
- `pnpm run typecheck`, `pnpm run lint` and `pnpm run check:boundaries` (including the release contract) passed.
- Not run: desktop build, packaged-app smoke, signed or cross-platform qualification. The change is renderer-only and unreleased.

## Remaining work

- Server-side `client_lag` signalling was left out with the shedding design. A server that sees `bufferedAmount` growth has no
  client-visible, lossless action today beyond closing at 16 MiB.
- The open-paragraph candidates (sub-block identities, throttled re-parse above a size) are untested.
- Property models for `sync-context-impl.tsx` and `session-ui-store.ts` would continue this work.
