import React from "react"
import { clampGridRatio, GRID_GAP } from "@/lib/supervision/sessionGrid"

interface Props {
  axis: "columns" | "rows"
  ratio: number
  extent: number
  label: string
  style: React.CSSProperties
  onChange: (ratio: number) => void
  /** Preset columns keep 320px. A nested custom split passes 160 so both sides can fit. */
  minimum?: number
}
export function GridSplitter({ axis, ratio, extent, label, style, onChange, minimum }: Props) {
  const drag = React.useRef<{ pointer: number; start: number; ratio: number } | null>(null)
  const floor = minimum ?? (axis === "columns" ? 320 : 160)
  const change = (value: number) => onChange(clampGridRatio(value, extent, floor))
  const end = (event: React.PointerEvent<HTMLDivElement>) => {
    drag.current = null
    if (event.currentTarget.hasPointerCapture(event.pointerId))
      event.currentTarget.releasePointerCapture(event.pointerId)
  }
  return (
    <div
      role="separator"
      tabIndex={0}
      aria-label={label}
      aria-orientation={axis === "columns" ? "vertical" : "horizontal"}
      aria-valuemin={Math.round(clampGridRatio(0, extent, floor) * 100)}
      aria-valuemax={Math.round(clampGridRatio(1, extent, floor) * 100)}
      aria-valuenow={Math.round(ratio * 100)}
      className="absolute z-10 bg-border hover:bg-primary focus-visible:bg-primary focus-visible:outline-none"
      style={{ ...style, touchAction: "none", cursor: axis === "columns" ? "col-resize" : "row-resize" }}
      onDoubleClick={() => change(0.5)}
      onKeyDown={(event) => {
        const negative = axis === "columns" ? "ArrowLeft" : "ArrowUp"
        const positive = axis === "columns" ? "ArrowRight" : "ArrowDown"
        if (event.key !== negative && event.key !== positive && event.key !== "Home") return
        event.preventDefault()
        change(event.key === "Home" ? 0.5 : ratio + (event.key === negative ? -0.02 : 0.02))
      }}
      onPointerDown={(event) => {
        if (event.button !== 0) return
        event.preventDefault()
        event.currentTarget.focus()
        event.currentTarget.setPointerCapture(event.pointerId)
        drag.current = { pointer: event.pointerId, start: axis === "columns" ? event.clientX : event.clientY, ratio }
      }}
      onPointerMove={(event) => {
        const current = drag.current
        if (!current || current.pointer !== event.pointerId) return
        change(
          current.ratio +
            ((axis === "columns" ? event.clientX : event.clientY) - current.start) / Math.max(1, extent - GRID_GAP),
        )
      }}
      onPointerUp={end}
      onPointerCancel={end}
      onLostPointerCapture={() => {
        drag.current = null
      }}
    />
  )
}
