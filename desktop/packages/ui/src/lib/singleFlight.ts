/**
 * Deduplicate concurrent async work by key: while a call for a key is in flight,
 * later calls join that same promise instead of starting a second one. The entry
 * is released when the work settles, and only by the call that installed it, so a
 * newer call that already replaced the slot is never evicted by an older promise
 * settling late.
 */
export const createSingleFlight = <T>() => {
  const inFlight = new Map<string, { promise: Promise<T> }>()

  return {
    run(key: string, start: () => Promise<T>): Promise<T> {
      const existing = inFlight.get(key)
      if (existing) {
        return existing.promise
      }

      const promise = start()
      const slot = { promise }
      inFlight.set(key, slot)

      const release = () => {
        if (inFlight.get(key) === slot) {
          inFlight.delete(key)
        }
      }
      promise.then(release, release)

      return promise
    },
    clear(key: string) {
      inFlight.delete(key)
    },
  }
}
