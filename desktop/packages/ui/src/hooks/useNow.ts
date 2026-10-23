import React from "react"
import { subscribeToNow } from "@/lib/nowTicker"

/**
 * Relative labels are minute-granularity; ticking faster than 30s only adds renders.
 * Every caller of the same interval shares one underlying timer.
 */
export const RELATIVE_TIME_TICK_MS = 30_000

/**
 * Wall-clock time that advances while mounted.
 *
 * Relative-time labels must derive from this value instead of calling `Date.now()`
 * during render: React Compiler memoizes a bare clock read (it has no dependencies)
 * and freezes the label at mount, so idle rows kept showing an old "2h ago".
 */
export const useNow = (intervalMs: number = RELATIVE_TIME_TICK_MS): number => {
  const [now, setNow] = React.useState(() => Date.now())

  React.useEffect(() => subscribeToNow(intervalMs, setNow), [intervalMs])

  return now
}
