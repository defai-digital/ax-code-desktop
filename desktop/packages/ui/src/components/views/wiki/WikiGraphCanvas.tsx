import React from "react"

import { Icon } from "@/components/icon/Icon"
import { Button } from "@/components/ui/button"
import { useI18n } from "@/lib/i18n"
import { fitCamera, zoomAt, type Camera } from "@/lib/wiki/camera"
import { neighbourhoodOf, truncateLabel, type WikiGraphEdge, type WikiGraphNode } from "@/lib/wiki/graph"
import type { LayoutPoint } from "@/lib/wiki/layout"
import { cn } from "@/lib/utils"

import { WIKI_KIND_COLOR } from "./labels"

const KIND_RADIUS = { page: 7, source: 5, symbol: 4 } as const

interface WikiGraphCanvasProps {
  snapshot: string
  nodes: readonly WikiGraphNode[]
  edges: readonly WikiGraphEdge[]
  /** Full-snapshot positions. Identity stays put while the user filters. */
  positions: readonly LayoutPoint[]
  /** Positions the Fit button frames. Filtering changes this, not the automatic fit. */
  fitPositions: readonly LayoutPoint[]
  selectedId: string | null
  onSelect: (id: string) => void
  label: string
}

export const WikiGraphCanvas: React.FC<WikiGraphCanvasProps> = ({
  snapshot,
  nodes,
  edges,
  positions,
  fitPositions,
  selectedId,
  onSelect,
  label,
}) => {
  const { t } = useI18n()
  const svgRef = React.useRef<SVGSVGElement>(null)
  const [camera, setCamera] = React.useState<Camera>({ x: 0, y: 0, scale: 1 })
  const [hoveredId, setHoveredId] = React.useState<string | null>(null)
  const dragRef = React.useRef<{ id: number; x: number; y: number; camX: number; camY: number } | null>(null)
  const [dragging, setDragging] = React.useState(false)

  React.useEffect(() => {
    const svg = svgRef.current
    if (!svg) return
    let fitted = false
    const apply = () => {
      if (fitted) return
      const rect = svg.getBoundingClientRect()
      if (rect.width < 2 || rect.height < 2) return
      setCamera(fitCamera(positions, rect.width, rect.height))
      fitted = true
    }
    apply()
    const observer = new ResizeObserver(() => apply())
    observer.observe(svg)
    return () => observer.disconnect()
  }, [positions, snapshot])

  React.useEffect(() => {
    const svg = svgRef.current
    if (!svg) return
    const onWheel = (event: WheelEvent) => {
      event.preventDefault()
      const rect = svg.getBoundingClientRect()
      const factor = event.deltaY < 0 ? 1.12 : 1 / 1.12
      setCamera((current) =>
        zoomAt(current, event.clientX - rect.left, event.clientY - rect.top, current.scale * factor),
      )
    }
    svg.addEventListener("wheel", onWheel, { passive: false })
    return () => svg.removeEventListener("wheel", onWheel)
  }, [])

  const graphics = React.useMemo(() => {
    const positionById = new Map(positions.map((point) => [point.id, point]))
    const neighbourhood = selectedId ? neighbourhoodOf(selectedId, edges) : null
    const edgeLines = edges.map((edge, index) => {
      const from = positionById.get(edge.from)
      const to = positionById.get(edge.to)
      if (!from || !to) return null
      const dimmed = neighbourhood !== null && (!neighbourhood.has(edge.from) || !neighbourhood.has(edge.to))
      const opacity = dimmed ? 0.12 : edge.freshness === "stale" ? 0.4 : edge.freshness === "unknown" ? 0.55 : 0.75
      return (
        <line
          key={`${edge.from}-${edge.to}-${edge.kind}-${index}`}
          x1={from.x}
          y1={from.y}
          x2={to.x}
          y2={to.y}
          stroke="var(--muted-foreground)"
          strokeWidth={1}
          strokeDasharray={edge.freshness === "stale" ? "4 3" : undefined}
          opacity={opacity}
        />
      )
    })
    const nodeShapes = nodes.map((node) => {
      const point = positionById.get(node.id)
      if (!point) return null
      const dimmed = neighbourhood !== null && !neighbourhood.has(node.id)
      const opacity = dimmed ? 0.16 : node.freshness === "stale" ? 0.55 : node.freshness === "unknown" ? 0.78 : 1
      const showLabel = node.kind === "page" || node.id === hoveredId || node.id === selectedId
      const radius = KIND_RADIUS[node.kind]
      return (
        <g
          key={node.id}
          data-wiki-node="true"
          transform={`translate(${point.x} ${point.y})`}
          opacity={opacity}
          className="cursor-pointer"
          onPointerDown={(event) => event.stopPropagation()}
          onClick={(event) => {
            event.stopPropagation()
            onSelect(node.id)
          }}
          onPointerEnter={() => setHoveredId(node.id)}
          onPointerLeave={() => setHoveredId((current) => (current === node.id ? null : current))}
        >
          <circle r={12} fill="transparent" />
          <circle
            r={radius}
            fill={WIKI_KIND_COLOR[node.kind]}
            stroke={WIKI_KIND_COLOR[node.kind]}
            strokeWidth={node.freshness === "stale" ? 1.5 : 0}
            strokeDasharray={node.freshness === "stale" ? "2 2" : undefined}
          />
          {node.id === selectedId ? (
            <circle r={radius + 3} fill="none" stroke="currentColor" strokeWidth={1.5} />
          ) : null}
          {showLabel ? (
            <text y={-radius - 4} textAnchor="middle" fontSize={11} fill="currentColor" className="pointer-events-none">
              {truncateLabel(node.label || node.id)}
            </text>
          ) : null}
        </g>
      )
    })
    return (
      <>
        {edgeLines}
        {nodeShapes}
      </>
    )
  }, [edges, hoveredId, nodes, onSelect, positions, selectedId])

  const zoomBy = (factor: number) => {
    const svg = svgRef.current
    if (!svg) return
    const rect = svg.getBoundingClientRect()
    setCamera((current) => zoomAt(current, rect.width / 2, rect.height / 2, current.scale * factor))
  }

  const fit = () => {
    const svg = svgRef.current
    if (!svg) return
    const rect = svg.getBoundingClientRect()
    setCamera(fitCamera(fitPositions, rect.width, rect.height))
  }

  return (
    <div className="relative min-h-0 min-w-0 flex-1">
      <svg
        ref={svgRef}
        role="img"
        aria-label={label}
        className={cn("h-full w-full touch-none text-foreground", dragging ? "cursor-grabbing" : "cursor-grab")}
        onPointerDown={(event) => {
          if (event.button !== 0) return
          const target = event.target
          if (target instanceof Element && target.closest("[data-wiki-node]")) return
          event.currentTarget.setPointerCapture(event.pointerId)
          dragRef.current = {
            id: event.pointerId,
            x: event.clientX,
            y: event.clientY,
            camX: camera.x,
            camY: camera.y,
          }
          setDragging(true)
        }}
        onPointerMove={(event) => {
          const drag = dragRef.current
          if (!drag || drag.id !== event.pointerId) return
          setCamera((current) => ({
            ...current,
            x: drag.camX + (event.clientX - drag.x),
            y: drag.camY + (event.clientY - drag.y),
          }))
        }}
        onPointerUp={(event) => {
          if (dragRef.current?.id !== event.pointerId) return
          dragRef.current = null
          setDragging(false)
        }}
        onPointerCancel={() => {
          dragRef.current = null
          setDragging(false)
        }}
      >
        <rect width="100%" height="100%" fill="transparent" />
        <g transform={`translate(${camera.x} ${camera.y}) scale(${camera.scale})`}>{graphics}</g>
      </svg>
      <div className="absolute right-2 top-2 flex flex-col gap-1">
        <Button
          variant="outline"
          size="icon"
          className="size-7"
          aria-label={t("wiki.graph.zoomIn")}
          onClick={() => zoomBy(1.2)}
        >
          <Icon name="add" className="h-3.5 w-3.5" />
        </Button>
        <Button
          variant="outline"
          size="icon"
          className="size-7"
          aria-label={t("wiki.graph.zoomOut")}
          onClick={() => zoomBy(1 / 1.2)}
        >
          <Icon name="subtract" className="h-3.5 w-3.5" />
        </Button>
        <Button variant="outline" size="icon" className="size-7" aria-label={t("wiki.graph.fit")} onClick={fit}>
          <Icon name="fullscreen" className="h-3.5 w-3.5" />
        </Button>
      </div>
    </div>
  )
}
