import React from "react"
import { subscribeToNow } from "@/lib/nowTicker"

export const useDurationTickerNow = (active: boolean, intervalMs: number = 250): number => {
  const [now, setNow] = React.useState(() => Date.now())

  React.useEffect(() => {
    if (!active) {
      return
    }

    return subscribeToNow(intervalMs, setNow)
  }, [active, intervalMs])

  return now
}
