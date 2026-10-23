type Subscriber = (now: number) => void

type TickerChannel = {
  subscribers: Set<Subscriber>
  timerId: number | null
}

const tickerChannels = new Map<number, TickerChannel>()

const getTickerChannel = (intervalMs: number): TickerChannel => {
  const existing = tickerChannels.get(intervalMs)
  if (existing) {
    return existing
  }

  const created: TickerChannel = {
    subscribers: new Set<Subscriber>(),
    timerId: null,
  }
  tickerChannels.set(intervalMs, created)
  return created
}

/**
 * Subscribe to one wall-clock timer shared by every subscriber of the same interval.
 * The subscriber is called immediately with the current time, then once per interval.
 */
export const subscribeToNow = (intervalMs: number, subscriber: Subscriber): (() => void) => {
  const channel = getTickerChannel(intervalMs)
  channel.subscribers.add(subscriber)
  subscriber(Date.now())

  if (channel.timerId === null && typeof window !== "undefined") {
    channel.timerId = window.setInterval(() => {
      const now = Date.now()
      channel.subscribers.forEach((listener) => {
        listener(now)
      })
    }, intervalMs)
  }

  return () => {
    const tracked = tickerChannels.get(intervalMs)
    if (!tracked) {
      return
    }

    tracked.subscribers.delete(subscriber)
    if (tracked.subscribers.size > 0) {
      return
    }

    if (tracked.timerId !== null && typeof window !== "undefined") {
      window.clearInterval(tracked.timerId)
    }
    tickerChannels.delete(intervalMs)
  }
}
