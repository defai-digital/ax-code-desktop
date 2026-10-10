import type { State } from "./types"

// Ephemeral hints, outside persisted state. Unknown snapshot writers fall back
// to reference comparisons; a hint is valid only for its exact predecessor.
const changes = new WeakMap<State["part"], { previous: WeakRef<State["part"]>; messageIds: ReadonlySet<string> }>()

export function recordPartChanges(previous: State["part"], next: State["part"], messageIds: ReadonlySet<string>) {
  changes.set(next, { previous: new WeakRef(previous), messageIds })
}

export function getPartChanges(previous: State["part"], next: State["part"]): ReadonlySet<string> | undefined {
  const hint = changes.get(next)
  return hint?.previous.deref() === previous ? hint.messageIds : undefined
}
