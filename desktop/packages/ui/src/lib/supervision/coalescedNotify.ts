/** A fixed trailing window: continuous notifications cannot postpone publication. */
export function createCoalescedNotify<Timer>(
  notify: () => void,
  schedule: (callback: () => void, delay: number) => Timer,
  cancel: (timer: Timer) => void,
  windowMs = 100,
) {
  let pending: { timer: Timer } | null = null

  const dispose = () => {
    if (pending) cancel(pending.timer)
    pending = null
  }

  return {
    notify: () => {
      if (pending) return
      pending = {
        timer: schedule(() => {
          pending = null
          notify()
        }, windowMs),
      }
    },
    flush: () => {
      dispose()
      notify()
    },
    dispose,
  }
}
