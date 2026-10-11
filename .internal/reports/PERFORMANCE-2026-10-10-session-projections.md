# Session projection performance follow-up

## Plan and scope

Keep Electron and the existing AX Code runtime contracts. Optimize the remaining
streaming subscription and projection work identified in the follow-up review:

1. Subscribe input history to user parts and keep its returned text array stable
   while assistant messages stream.
2. Reuse active-session indexes and update only records named by valid part-change
   hints. Cache the source part-map reference for repeated snapshot reads.
3. Cache historical compaction classification in MessageList without changing
   deduplication, role resolution, synthetic bridges, or Markdown semantics.
4. Cover fallback snapshots, skipped publications, user edits, revert transitions,
   suspension/resume, deletion, and session switching; run the workspace checks
   and commit the reviewed changes.

## Implementation

`session-message-records.ts` extracts the pure projection from the sync context.
A message-ID index is built when the message list or visibility changes. For a
hinted part update, only the named records are compared/replaced. The immutable
record list is copied once if a record changed; the index and unchanged records
are reused. Repeated reads of the same part map return the cached snapshot.
Unhinted updates and skipped hint predecessors scan all visible records. Duplicate
IDs also use the full scan to preserve all record occurrences. The existing
40-entry per-directory snapshot cache remains bounded.

`user-message-history.ts` selects only user records, preserves reverse history
order and the first nonempty text-part behavior, and returns the same string array
when its content is unchanged. The hook subscribes directly to user part IDs;
assistant deltas do not notify this subscription. Message-list changes remain
observable, including role changes and recovery snapshots. Selector snapshots
are scoped to the hook, with session and source-reference validation.

Subscriptions now also notify when the session's revert message ID changes without
any message/part change, including suspended subscriptions. This fixes a visibility
invalidation gap discovered during the performance review.

MessageList caches compaction command classification by immutable source record,
so streaming updates do not repeatedly inspect all historical text parts. WeakMap
keys do not keep discarded records alive. Full-list deduplication and bridge
ordering still run, preserving their existing behavior. Obsolete snapshot matching
and full-rebuild helpers were removed from the sync context during extraction.

## Controlled CPU benchmark

Command:

```sh
pnpm --dir desktop/packages/ui exec tsx src/sync/__tests__/session-projection.bench.ts
```

200 assistant-tail updates per run, alternating user/assistant history; median of
five measured runs after one warmup. State updates are prepared outside timing.
The baseline retains its prior ID map and reproduces the prior record-list/map
rebuild and user-history projection. Outputs are compared for equivalence and
optimized user-history reference stability is asserted.

| Messages | Baseline ms/update | Incremental ms/update |
| --- | ---: | ---: |
| 500 | 0.03171 | 0.000922 |
| 4,000 | 0.34335 | 0.001841 |

These measurements cover session records plus input history only, excluding event
publication, React rendering, Markdown, browser layout, and paint. They are not
whole-app speedup or FPS measurements. Array copying remains O(n) for a changed
active record; the removed work includes rebuilding the ID map, probing unchanged
parts, filtering assistant records for input history, and constructing equivalent
history strings.

## Remaining hot paths

MessageList still scans message IDs for latest-wins deduplication and processes
bridge relationships. Turn grouping also traverses messages. Long incomplete
Markdown tails still parse and lay out on the renderer thread. This change leaves
Markdown cadence and syntax behavior intact; a renderer trace from a representative
slow session is needed to determine their contribution to visible stalls.

## Validation

- `pnpm run test`: passed, 2,823 tests passed and one skipped (61 workspace
  script tests, 386 Electron tests, 1,586 UI tests, and 790 web tests).
- The five new projection/subscription regressions passed, including a guarded
  parts lookup proving that hinted assistant updates do not read user parts.
- `pnpm run check:boundaries`: passed, including runtime pins, ownership, and the
  shadow-only release contract.
- Final `pnpm run typecheck` and `pnpm run lint`: passed, without lint warnings.
- Final `pnpm run build`: passed, including web assets, Electron main bundling,
  and native module rebuild.
- `git diff --check`: passed.

The first full-test attempt hit the existing store-boundary test's five-second
limit while independent typechecks, lint, boundary checks, and production build
were running concurrently. A subsequent complete `pnpm run test` without those
competing checks passed using the unchanged timeout and test assertions. No
unrelated test or timeout configuration was changed.
