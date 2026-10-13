/**
 * Release a retired timeline after React finishes detaching its tree.
 *
 * Chromium can retain a scroll event's target until the next rendered frame,
 * keeping the whole detached conversation DOM alive across session switches
 * (the chat viewport remounts per session via `key={currentSessionId}`). Once
 * the microtask runs, React has finished the commit; a node that stayed
 * detached is safe to empty. A node that got re-adopted or reconnected in the
 * meantime is left alone.
 */
export const retireScrollContent = (node: HTMLElement, isCurrent: () => boolean): void => {
  queueMicrotask(() => {
    if (isCurrent() || node.isConnected) return
    node.replaceChildren()
  })
}
