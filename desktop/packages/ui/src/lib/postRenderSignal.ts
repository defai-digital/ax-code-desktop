/**
 * A diff viewer's "Pierre rendered" event. Pierre calls `onPostRender` after every render, including when its
 * virtualizer mounts lines that scrolled into view, so listeners learn that annotation slots may have appeared,
 * moved or gone without watching the diff's DOM (G UX-14).
 */
export interface PostRenderSignal {
  subscribe: (listener: () => void) => () => void
  emit: () => void
}

export function createPostRenderSignal(): PostRenderSignal {
  const listeners = new Set<() => void>()
  return {
    subscribe: (listener) => {
      listeners.add(listener)
      return () => {
        listeners.delete(listener)
      }
    },
    emit: () => {
      for (const listener of Array.from(listeners)) listener()
    },
  }
}
