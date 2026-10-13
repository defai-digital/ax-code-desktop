export type ReplaceableTimeoutId = number

export const clearReplaceableTimeout = (timerId: ReplaceableTimeoutId | null): null => {
  if (timerId !== null) {
    window.clearTimeout(timerId)
  }
  return null
}

export const resetReplaceableTimeout = (
  timerId: ReplaceableTimeoutId | null,
  onReset: () => void,
  delayMs: number,
): ReplaceableTimeoutId => {
  clearReplaceableTimeout(timerId)
  return window.setTimeout(onReset, delayMs)
}
