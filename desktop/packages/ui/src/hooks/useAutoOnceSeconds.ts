import React from "react"

/**
 * Seconds left before the runtime answers a pending permission "once" by itself, or null when it will not.
 *
 * The runtime stamps `autoOnceAt` (epoch ms) on an ask it will auto-reply to after a deadline: an interactive-only
 * permission while the session runs unattended (auto mode) with the sandbox off. It re-sends the ask to add the stamp
 * when a queued request is promoted and to remove it when the mode changes. The runtime timer is authoritative and
 * its reply removes the request, so a client only renders the countdown and never submits on its own. The request id
 * is part of the dependency so a different request restarts the tick.
 */
export function useAutoOnceSeconds(autoOnceAt: number | undefined, requestId: string): number | null {
  const [seconds, setSeconds] = React.useState<number | null>(null)
  React.useEffect(() => {
    if (!autoOnceAt) {
      setSeconds(null)
      return
    }
    const update = () => setSeconds(Math.max(0, Math.ceil((autoOnceAt - Date.now()) / 1000)))
    update()
    const interval = window.setInterval(update, 1000)
    return () => window.clearInterval(interval)
  }, [autoOnceAt, requestId])
  return seconds
}
