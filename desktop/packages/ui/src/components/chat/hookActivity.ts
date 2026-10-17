import type { HookRun } from "@/stores/useHookActivityStore"

export const HOOK_ROW_LIMIT = 3

/**
 * The runs worth surfacing in chat: only the ones that stopped or gated a
 * tool call (`blocked` / `ask`), newest first, dismissed ones removed, and
 * capped so a hook storm cannot flood the composer area.
 */
export function visibleHookRows(
  runs: readonly HookRun[],
  dismissedIds: ReadonlySet<string>,
): { visible: HookRun[]; hiddenCount: number } {
  const notable = runs.filter(
    (run) => (run.outcome === "blocked" || run.outcome === "ask") && !dismissedIds.has(run.id),
  )
  const newestFirst = [...notable].reverse()
  return {
    visible: newestFirst.slice(0, HOOK_ROW_LIMIT),
    hiddenCount: Math.max(0, newestFirst.length - HOOK_ROW_LIMIT),
  }
}
