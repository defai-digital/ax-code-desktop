import React from "react"

import { useI18n } from "@/lib/i18n"
import { cn } from "@/lib/utils"
import { timelineWindow, type RailTurn } from "./lib/timelineRail/timelineRailModel"

// One tick per turn. The pitch is the click target height, so it stays large enough to hit with a pointer.
const TICK_PITCH_PX = 10
const ARROW_PX = 14
const RAIL_MIN_CONTAINER_WIDTH_PX = 560
const RAIL_VERTICAL_PADDING_PX = 24

// A turn counts as reached once its top is within this distance below the viewport top, so a jump that aligns it with
// the top (scrollIntoView) selects it instead of the turn after it.
const REACHED_TOLERANCE_PX = 24

type TimelineRailProps = {
  turns: readonly RailTurn[]
  scrollRef: React.RefObject<HTMLDivElement | null>
  /** Used until the first scroll measurement, and when no rendered turn can be measured. */
  activeTurnId: string | null
  atBottom: boolean
  onJumpToTurn: (turnId: string) => void
}

/**
 * A vertical per-turn tick rail on the right edge of the transcript, the Desktop counterpart of the AX Code TUI
 * timeline rail. It navigates only: wheel, keyboard and the scrollbar keep scrolling the transcript itself.
 */
/**
 * The last rendered turn whose top has reached the viewport top, as the TUI rail does. The transcript's own active
 * turn is the most visible one near the top, which after a jump is often the turn below the one that was clicked.
 */
function useReachedTurnId(
  scrollRef: React.RefObject<HTMLDivElement | null>,
  enabled: boolean,
  turns: readonly RailTurn[],
) {
  const [reachedId, setReachedId] = React.useState<string | null>(null)

  React.useEffect(() => {
    const container = scrollRef.current
    if (!enabled || !container) return
    let frame: number | null = null
    const measure = () => {
      frame = null
      const line = container.getBoundingClientRect().top + REACHED_TOLERANCE_PX
      let reached: string | null = null
      let reachedTop = -Infinity
      let first: string | null = null
      let firstTop = Infinity
      container.querySelectorAll<HTMLElement>("[data-turn-id]").forEach((node) => {
        const id = node.dataset.turnId
        if (!id) return
        const top = node.getBoundingClientRect().top
        if (top < firstTop) {
          firstTop = top
          first = id
        }
        if (top <= line && top > reachedTop) {
          reachedTop = top
          reached = id
        }
      })
      setReachedId(reached ?? first)
    }
    const schedule = () => {
      if (frame === null) frame = requestAnimationFrame(measure)
    }
    measure()
    container.addEventListener("scroll", schedule, { passive: true })
    return () => {
      container.removeEventListener("scroll", schedule)
      if (frame !== null) cancelAnimationFrame(frame)
    }
  }, [enabled, scrollRef, turns])

  return reachedId
}

export const TimelineRail: React.FC<TimelineRailProps> = ({
  turns,
  scrollRef,
  activeTurnId,
  atBottom,
  onJumpToTurn,
}) => {
  const { t, formatLocale } = useI18n()
  const rootRef = React.useRef<HTMLDivElement | null>(null)
  const [size, setSize] = React.useState({ width: 0, height: 0 })
  const [hoverIndex, setHoverIndex] = React.useState<number | null>(null)
  const [railHovered, setRailHovered] = React.useState(false)

  React.useLayoutEffect(() => {
    const root = rootRef.current
    const parent = root?.parentElement
    if (!parent || typeof ResizeObserver === "undefined") return
    const measure = () => setSize({ width: parent.clientWidth, height: parent.clientHeight })
    measure()
    const observer = new ResizeObserver(measure)
    observer.observe(parent)
    return () => observer.disconnect()
  }, [])

  const reachedTurnId = useReachedTurnId(scrollRef, !atBottom && turns.length > 1, turns)
  const activeIndex = React.useMemo(() => {
    if (turns.length === 0) return 0
    if (atBottom) return turns.length - 1
    const id = reachedTurnId ?? activeTurnId
    if (!id) return turns.length - 1
    const index = turns.findIndex((turn) => turn.id === id)
    return index >= 0 ? index : turns.length - 1
  }, [activeTurnId, atBottom, reachedTurnId, turns])

  const capacity = Math.floor((size.height - RAIL_VERTICAL_PADDING_PX - ARROW_PX * 2) / TICK_PITCH_PX)
  const ticks = React.useMemo(
    () => timelineWindow(turns.length, capacity, activeIndex, atBottom),
    [activeIndex, atBottom, capacity, turns.length],
  )

  const timeFormat = React.useMemo(() => {
    try {
      return new Intl.DateTimeFormat(formatLocale, { hour: "numeric", minute: "2-digit" })
    } catch {
      return new Intl.DateTimeFormat(undefined, { hour: "numeric", minute: "2-digit" })
    }
  }, [formatLocale])
  const timeLabel = React.useCallback(
    (turn: RailTurn | undefined) => (turn && turn.created !== null ? timeFormat.format(turn.created) : ""),
    [timeFormat],
  )

  if (size.width < RAIL_MIN_CONTAINER_WIDTH_PX || ticks.length === 0) {
    return <div ref={rootRef} aria-hidden className="hidden" />
  }

  const hovered = hoverIndex === null ? undefined : turns[hoverIndex]
  const hoveredLabel = timeLabel(hovered)
  const shownIndex = hoverIndex ?? activeIndex
  const shownLabel = timeLabel(turns[shownIndex])
  const canStepBack = activeIndex > 0
  const canStepForward = !atBottom && activeIndex < turns.length - 1

  return (
    <div
      ref={rootRef}
      role="navigation"
      aria-label={t("chat.timelineRail.aria")}
      className="pointer-events-none absolute inset-y-0 right-3 z-20 flex w-6 flex-col items-center justify-center"
      data-testid="chat-timeline-rail"
    >
      <div
        className="pointer-events-auto relative flex flex-col items-center"
        onMouseEnter={() => setRailHovered(true)}
        onMouseLeave={() => {
          setRailHovered(false)
          setHoverIndex(null)
        }}
      >
        <button
          type="button"
          tabIndex={-1}
          aria-label={t("chat.timelineRail.previous")}
          disabled={!canStepBack}
          onClick={() => {
            const previous = turns[activeIndex - 1]
            if (previous) onJumpToTurn(previous.id)
          }}
          className="flex w-6 items-center justify-center text-[8px] leading-none text-muted-foreground transition-colors hover:text-foreground disabled:text-muted-foreground/30"
          style={{ height: ARROW_PX }}
        >
          ▲
        </button>
        {ticks.map((tick) => {
          const turn = turns[tick.index]
          if (!turn) return null
          const active = tick.index === activeIndex
          const hover = tick.index === hoverIndex
          return (
            <button
              key={turn.id}
              type="button"
              tabIndex={-1}
              aria-label={t("chat.timelineRail.turn", {
                index: tick.index + 1,
                total: turns.length,
                time: timeLabel(turn),
              })}
              aria-current={active ? "location" : undefined}
              onMouseEnter={() => setHoverIndex(tick.index)}
              onFocus={() => setHoverIndex(tick.index)}
              onBlur={() => setHoverIndex(null)}
              onClick={() => onJumpToTurn(turn.id)}
              className="flex w-6 items-center justify-end"
              style={{ height: TICK_PITCH_PX }}
            >
              <span
                aria-hidden
                className={cn(
                  "block rounded-full transition-all",
                  active
                    ? "h-[2px] w-4 bg-foreground"
                    : hover
                      ? "h-px w-3 bg-foreground"
                      : "h-px w-2 bg-muted-foreground/60",
                )}
              />
            </button>
          )
        })}
        <button
          type="button"
          tabIndex={-1}
          aria-label={t("chat.timelineRail.next")}
          disabled={!canStepForward}
          onClick={() => {
            const next = turns[activeIndex + 1]
            if (next) onJumpToTurn(next.id)
          }}
          className="flex w-6 items-center justify-center text-[8px] leading-none text-muted-foreground transition-colors hover:text-foreground disabled:text-muted-foreground/30"
          style={{ height: ARROW_PX }}
        >
          ▼
        </button>

        {hovered && (hovered.preview || hoveredLabel) ? (
          <div
            className="pointer-events-none absolute right-full mr-2 w-max max-w-[16rem] rounded-lg border border-border/60 px-2.5 py-1.5 shadow-lg"
            style={{
              backgroundColor: "var(--surface-elevated)",
              top:
                ARROW_PX +
                (ticks.find((tick) => tick.index === hoverIndex)?.offset ?? 0) * TICK_PITCH_PX +
                TICK_PITCH_PX / 2,
              transform: "translateY(-50%)",
            }}
          >
            {hoveredLabel ? <div className="typography-micro text-muted-foreground">{hoveredLabel}</div> : null}
            {hovered.preview ? (
              <div className="typography-ui-label line-clamp-2 break-words text-foreground">{hovered.preview}</div>
            ) : null}
          </div>
        ) : railHovered && shownLabel ? (
          <div
            className="pointer-events-none absolute right-full mr-2 whitespace-nowrap typography-micro text-muted-foreground"
            style={{
              top:
                ARROW_PX +
                (ticks.find((tick) => tick.index === shownIndex)?.offset ?? 0) * TICK_PITCH_PX +
                TICK_PITCH_PX / 2,
              transform: "translateY(-50%)",
            }}
          >
            {shownLabel}
          </div>
        ) : null}
      </div>
    </div>
  )
}
