/**
 * Keyboard reordering for draft starters. Enter and Space submit a starter, so moving uses
 * Alt (Option on macOS) with the arrow keys: Left/Up moves one place earlier, Right/Down one
 * place later, within the starter's own group. Returns the id of the starter to swap places
 * with, or null when the key is not a move or the starter is already at that edge.
 */
export function keyboardReorderTarget(
  orderedIds: readonly string[],
  id: string,
  event: { key: string; altKey: boolean; ctrlKey?: boolean; metaKey?: boolean; shiftKey?: boolean },
): string | null {
  if (!event.altKey || event.ctrlKey || event.metaKey || event.shiftKey) return null
  const step =
    event.key === "ArrowLeft" || event.key === "ArrowUp"
      ? -1
      : event.key === "ArrowRight" || event.key === "ArrowDown"
        ? 1
        : 0
  if (step === 0) return null
  const index = orderedIds.indexOf(id)
  if (index < 0) return null
  return orderedIds[index + step] ?? null
}
