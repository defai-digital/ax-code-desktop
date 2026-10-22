import React from "react"
import { WebMcpPageSwitcher } from "@/components/mcp/WebMcpPages"
import { viewKeyFor } from "@/lib/webMcpViewKey"
import { useThemeSystem } from "@/contexts/useThemeSystem"
import { useSupervisionRows } from "@/hooks/useSupervisionRows"
import { useI18n } from "@/lib/i18n"
import { normalizeProjectPath } from "@/lib/projectResolution"
import {
  buildEmbeddedSessionChatURL,
  syncEmbeddedTheme,
  syncEmbeddedVisibility,
} from "@/lib/supervision/embeddedSession"
import { openSupervisedSession } from "@/lib/supervision/openSession"
import { canOpenSessionWindow } from "@/lib/supervision/openSessionWindow"
import { gridWindowOwns, useGridWindowOwners, trackGridWindows, reconcileGridWindows, popOutGridSlot, returnGridSlot } from "@/lib/supervision/sessionGridPopout"
import { ratiosForLayout } from "@/lib/supervision/sessionGridPreferences"
import {
  applyGridDrop,
  gridDropEdge,
  gridNeighbor,
  layoutGridTree,
  moveGridSlot,
  resizeGridSlots,
  resolveGridSession,
  sessionGridGeometry,
  splitGridPane,
  updateSplitRatio,
  type GridDropTarget,
  type GridEdge,
  type PlacedPane,
  type SessionGridLayout,
  type SessionGridSlot,
  type SessionGridState,
} from "@/lib/supervision/sessionGrid"
import { useUIStore } from "@/stores/useUIStore"
import { SupervisionStateBadge } from "@/components/supervision/SupervisionStateBadge"
import { GridSplitter } from "./GridSplitter"

const MOVE_CONTROLS: Array<{
  direction: GridEdge
  label: "sessionGrid.moveLeft" | "sessionGrid.moveRight" | "sessionGrid.moveUp" | "sessionGrid.moveDown"
  glyph: string
}> = [
  { direction: "left", label: "sessionGrid.moveLeft", glyph: "←" },
  { direction: "right", label: "sessionGrid.moveRight", glyph: "→" },
  { direction: "top", label: "sessionGrid.moveUp", glyph: "↑" },
  { direction: "bottom", label: "sessionGrid.moveDown", glyph: "↓" },
]

function EmbeddedGridSession({ slot, title, index }: { slot: SessionGridSlot; title: string; index: number }) {
  const frame = React.useRef<HTMLIFrameElement>(null)
  const [ready, setReady] = React.useState(false)
  const { themeMode, lightThemeId, darkThemeId, currentTheme } = useThemeSystem()
  // Stagger new realms; only populated, resolved slots mount an embedded app.
  React.useEffect(() => {
    const timer = setTimeout(() => setReady(true), index * 100)
    return () => clearTimeout(timer)
  }, [index])
  const sync = React.useCallback(() => {
    if (!frame.current) return
    syncEmbeddedTheme(frame.current, { themeMode, lightThemeId, darkThemeId, currentTheme })
    syncEmbeddedVisibility(frame.current, document.visibilityState !== "hidden")
  }, [themeMode, lightThemeId, darkThemeId, currentTheme])
  React.useEffect(() => {
    sync()
    document.addEventListener("visibilitychange", sync)
    return () => document.removeEventListener("visibilitychange", sync)
  }, [sync, ready])
  return ready ? (
    <iframe
      ref={frame}
      loading="lazy"
      src={buildEmbeddedSessionChatURL(slot.sessionId, slot.directory)}
      title={title}
      onLoad={sync}
      className="h-full w-full border-0 bg-background"
    />
  ) : null
}

export function SessionGrid() {
  const { t } = useI18n()
  const grid = useUIStore((s) => s.sessionGrid)
  const owners = useGridWindowOwners((s) => s.owners)
  const [announcement, setAnnouncement] = React.useState("")
  const focusDestination = React.useRef<number | null>(null)
  React.useLayoutEffect(() => {
    if (focusDestination.current === null) return
    container.current?.querySelector<HTMLElement>(`[data-session-grid-slot="${focusDestination.current}"] [data-session-grid-handle]`)?.focus()
    focusDestination.current = null
  }, [grid])
  const setGrid = useUIStore((s) => s.setSessionGrid)
  const rows = useSupervisionRows()
  const container = React.useRef<HTMLDivElement>(null)
  const canvasRef = React.useRef<HTMLDivElement>(null)
  const panesRef = React.useRef<PlacedPane[]>([])
  const dragRef = React.useRef<{
    pointerId: number
    from: number
    startX: number
    startY: number
    moved: boolean
  } | null>(null)
  const [drop, setDrop] = React.useState<{ target: number; edge: GridDropTarget } | null>(null)
  const [size, setSize] = React.useState({ width: 646, height: 600 })
  React.useLayoutEffect(() => {
    const node = container.current
    if (!node) return
    const measure = () => setSize({ width: node.clientWidth, height: node.clientHeight })
    measure()
    const observer = new ResizeObserver(measure)
    observer.observe(node)
    return () => observer.disconnect()
  }, [])
  React.useEffect(() => {
    trackGridWindows()
    void reconcileGridWindows()
  }, [])
  React.useEffect(() => {
    const localPoint = (event: PointerEvent) => {
      const bounds = canvasRef.current?.getBoundingClientRect()
      if (!bounds) return null
      return { x: event.clientX - bounds.left, y: event.clientY - bounds.top }
    }
    const hit = (x: number, y: number) => {
      for (const pane of panesRef.current) {
        if (!pane) continue
        if (x >= pane.left && x <= pane.left + pane.width && y >= pane.top && y <= pane.top + pane.height) {
          return { target: pane.slot, edge: gridDropEdge(x - pane.left, y - pane.top, pane.width, pane.height) }
        }
      }
      return null
    }
    const move = (event: PointerEvent) => {
      const drag = dragRef.current
      if (!drag || drag.pointerId !== event.pointerId) return
      if (!drag.moved && Math.hypot(event.clientX - drag.startX, event.clientY - drag.startY) < 4) return
      drag.moved = true
      const local = localPoint(event)
      const next = local ? hit(local.x, local.y) : null
      setDrop((current) => (current?.target === next?.target && current?.edge === next?.edge ? current : next))
    }
    const end = (event: PointerEvent) => {
      const drag = dragRef.current
      if (!drag || drag.pointerId !== event.pointerId) return
      dragRef.current = null
      const local = localPoint(event)
      const target = drag.moved && local ? hit(local.x, local.y) : null
      setDrop(null)
      if (!target || target.target === drag.from) return
      const current = useUIStore.getState().sessionGrid
      setGrid(applyGridDrop(current, drag.from, target.target, target.edge))
    }
    const cancel = (event: PointerEvent) => {
      if (dragRef.current?.pointerId !== event.pointerId) return
      dragRef.current = null
      setDrop(null)
    }
    window.addEventListener("pointermove", move)
    window.addEventListener("pointerup", end)
    window.addEventListener("pointercancel", cancel)
    return () => {
      window.removeEventListener("pointermove", move)
      window.removeEventListener("pointerup", end)
      window.removeEventListener("pointercancel", cancel)
    }
  }, [setGrid])
  const tree = grid.tree ?? null
  const preset = tree ? null : sessionGridGeometry(grid.layout, size.width, size.height, grid.ratios)
  const custom = tree ? layoutGridTree(tree, size.width, size.height) : null
  const panes: PlacedPane[] = custom ? custom.panes : preset!.panes.map((pane, slot) => ({ slot, ...pane }))
  panesRef.current = panes
  const commit = (update: (current: SessionGridState) => SessionGridState) => setGrid(update(useUIStore.getState().sessionGrid))
  const replace = (index: number, slot: SessionGridSlot | null) =>
    commit((current) => ({ ...current, slots: current.slots.map((old, i) => (i === index ? slot : old)) }))
  const move = (index: number, direction: GridEdge) => {
    const target = gridNeighbor(panes, index, direction)
    if (target === null) return
    const current = useUIStore.getState().sessionGrid
    const title = resolveGridSession(current.slots[index], rows)?.title ?? t("sessionGrid.empty")
    focusDestination.current = target
    setAnnouncement(t("sessionGrid.moved", { title, count: target + 1 }))
    setGrid(moveGridSlot(current, index, direction, panes))
  }
  return (
    <section className="flex h-full min-h-0 flex-col" aria-label={t("sessionGrid.title")} data-session-grid>
      <div aria-live="polite" aria-atomic="true" className="sr-only">{announcement}</div>
      <header className="flex shrink-0 flex-wrap items-center gap-3 border-b border-border p-2">
        <h2 className="typography-ui-label">{t("sessionGrid.title")}</h2>
        <label className="typography-meta">
          {t("sessionGrid.layout")}{" "}
          <select
            aria-label={t("sessionGrid.layout")}
            className="rounded border border-border bg-background p-1"
            value={tree ? "custom" : String(grid.layout)}
            onChange={(event) => {
              if (event.target.value === "custom") return
              const layout = Number(event.target.value) as SessionGridLayout
              commit((current) => ({
                ...current,
                layout,
                slots: resizeGridSlots(current.slots, layout),
                ratios: ratiosForLayout(layout) ?? { columns: 0.5, rows: 0.5 },
                tree: null,
              }))
            }}
          >
            {tree ? <option value="custom">{t("sessionGrid.layout.custom")}</option> : null}
            <option value={1}>{t("sessionGrid.layout.one")}</option>
            <option value={2}>{t("sessionGrid.layout.two")}</option>
            <option value={3}>{t("sessionGrid.layout.three")}</option>
            <option value={4}>{t("sessionGrid.layout.four")}</option>
          </select>
        </label>
      </header>
      <div ref={container} className="min-h-0 flex-1 overflow-auto">
        <div
          ref={canvasRef}
          data-session-grid-canvas
          className="relative"
          style={{ width: custom?.width ?? preset!.width, height: custom?.height ?? preset!.height }}
        >
          {grid.slots.map((slot, index) => {
            const pane = panes[index]
            if (!pane) return null
            const row = resolveGridSession(slot, rows)
            const candidates = rows.filter(
              (candidate) =>
                normalizeProjectPath(candidate.directory) &&
                !grid.slots.some((other, i) => i !== index && resolveGridSession(other, [candidate])),
            )
            const popped = Boolean(slot && (slot.poppedOut || gridWindowOwns(slot, owners)))
            const atLimit = grid.slots.length >= 4
            return (
              <section
                key={index}
                aria-label={t("sessionGrid.pane", { count: index + 1 })}
                data-session-grid-slot={index}
                data-session-grid-session={slot?.sessionId ?? ""}
                data-session-grid-popped={popped ? "true" : "false"}
                className="absolute flex min-h-0 flex-col overflow-hidden bg-background"
                style={{ left: pane.left, top: pane.top, width: pane.width, height: pane.height }}
              >
                <header className="flex shrink-0 flex-wrap items-center gap-1 overflow-hidden border-b border-border px-2 py-1">
                  <div
                    data-session-grid-handle
                    role="group"
                    tabIndex={0}
                    aria-keyshortcuts="ArrowLeft ArrowRight ArrowUp ArrowDown"
                    aria-label={t("sessionGrid.moveSession", { title: row?.title ?? t("sessionGrid.empty") })}
                    className="min-w-16 flex-1 cursor-grab touch-none"
                    onKeyDown={(event) => {
                      if (event.target !== event.currentTarget) return
                      const direction = (
                        { ArrowLeft: "left", ArrowRight: "right", ArrowUp: "top", ArrowDown: "bottom" } as const
                      )[event.key as "ArrowLeft" | "ArrowRight" | "ArrowUp" | "ArrowDown"]
                      if (!direction) return
                      event.preventDefault()
                      move(index, direction)
                    }}
                    onPointerDown={(event) => {
                      if (event.button !== 0) return
                      const target = event.target instanceof Element ? event.target : null
                      if (target?.closest("button, select, input, textarea, a")) return
                      event.preventDefault()
                      dragRef.current = {
                        pointerId: event.pointerId,
                        from: index,
                        startX: event.clientX,
                        startY: event.clientY,
                        moved: false,
                      }
                      try {
                        event.currentTarget.setPointerCapture(event.pointerId)
                      } catch {
                        // Pointer capture is unavailable in some test renderers. Window listeners still see the gesture.
                      }
                    }}
                  >
                    <div className="truncate typography-ui-label" title={row?.title}>
                      {row?.title ?? t("sessionGrid.add")}
                    </div>
                    {row && (
                      <div className="truncate typography-meta text-muted-foreground" title={row.directory ?? ""}>
                        {row.projectLabel || row.directory}
                      </div>
                    )}
                  </div>
                  {slot && !popped && <WebMcpPageSwitcher selectedKey={viewKeyFor(slot.directory, slot.sessionId)} compact onRetry={() => {}} />}
                  {row && <SupervisionStateBadge state={row.state} />}
                  {MOVE_CONTROLS.map((control) => (
                    <button
                      key={control.direction}
                      type="button"
                      className="rounded border border-border px-1.5 py-0.5 typography-meta"
                      aria-label={t(control.label)}
                      disabled={gridNeighbor(panes, index, control.direction) === null}
                      onClick={() => move(index, control.direction)}
                    >
                      {control.glyph}
                    </button>
                  ))}
                  <select
                    aria-label={t("sessionGrid.split")}
                    data-session-grid-split
                    className="max-w-full rounded border border-border bg-background p-1 typography-meta"
                    value=""
                    disabled={atLimit}
                    title={atLimit ? t("sessionGrid.splitLimit") : undefined}
                    onChange={(event) => {
                      const edge = event.target.value as GridEdge
                      if (!edge) return
                      const next = splitGridPane(useUIStore.getState().sessionGrid, index, edge)
                      if (next) setGrid(next)
                    }}
                  >
                    <option value="">{t("sessionGrid.split")}</option>
                    <option value="left">{t("sessionGrid.splitLeft")}</option>
                    <option value="right">{t("sessionGrid.splitRight")}</option>
                    <option value="top">{t("sessionGrid.splitTop")}</option>
                    <option value="bottom">{t("sessionGrid.splitBottom")}</option>
                  </select>
                  {row && (
                    <button
                      type="button"
                      className="rounded border border-border px-2 py-1 typography-meta"
                      onClick={() => openSupervisedSession(row)}
                    >
                      {t("sessionGrid.focus")}
                    </button>
                  )}
                  <select
                    aria-label={t(row ? "sessionGrid.replace" : "sessionGrid.add")}
                    className="max-w-40 rounded border border-border bg-background p-1 typography-meta"
                    value=""
                    onChange={(event) => {
                      if (!event.target.value) return
                      // Values are session identities, not positions: the ranked list can change while the menu is open.
                      const candidate = candidates.find(
                        (entry) => `${entry.sessionId}\u0000${entry.directory}` === event.target.value,
                      )
                      const directory = normalizeProjectPath(candidate?.directory)
                      if (candidate && directory) replace(index, { sessionId: candidate.sessionId, directory })
                    }}
                  >
                    <option value="">{t(row ? "sessionGrid.replace" : "sessionGrid.add")}</option>
                    {candidates.map((candidate) => (
                      <option
                        key={`${candidate.sessionId}:${candidate.directory}`}
                        value={`${candidate.sessionId}\u0000${candidate.directory}`}
                      >
                        {candidate.projectLabel || candidate.directory} — {candidate.title}
                      </option>
                    ))}
                  </select>
                  {canOpenSessionWindow() && row && slot && !popped && (
                    <button
                      type="button"
                      data-session-grid-popout
                      className="max-w-full truncate rounded border border-border px-2 py-1 typography-meta"
                      aria-label={t("sessionGrid.popOut", { title: row.title })}
                      onClick={() => {
                        void popOutGridSlot(slot.sessionId, slot.directory, t("supervision.navigation.openInWindowFailed"))
                      }}
                    >
                      {t("sessionGrid.popOut", { title: row.title })}
                    </button>
                  )}
                  {popped && slot && (
                    <button
                      type="button"
                      data-session-grid-return
                      className="max-w-full truncate rounded border border-border px-2 py-1 typography-meta"
                      aria-label={t("sessionGrid.popIn", { title: row?.title ?? slot.sessionId })}
                      onClick={() => returnGridSlot(slot.sessionId, slot.directory)}
                    >
                      {t("sessionGrid.popIn", { title: row?.title ?? slot.sessionId })}
                    </button>
                  )}
                  {slot && (
                    <button
                      type="button"
                      className="rounded border border-border px-2 py-1 typography-meta"
                      onClick={(event) => {
                        // The button disappears with the session; keep keyboard focus in this pane, on its picker.
                        const paneNode = event.currentTarget.closest("section")
                        replace(index, null)
                        requestAnimationFrame(() =>
                          paneNode?.querySelector<HTMLSelectElement>("select:not([data-session-grid-split])")?.focus(),
                        )
                      }}
                    >
                      {t("sessionGrid.close")}
                    </button>
                  )}
                </header>
                <div className="min-h-0 flex-1">
                  {popped ? (
                    <p role="status" className="p-4 typography-meta text-muted-foreground">
                      {t("sessionGrid.poppedOut")}
                    </p>
                  ) : row && slot ? (
                    <EmbeddedGridSession
                      key={`${slot.sessionId}:${slot.directory}`}
                      slot={slot}
                      title={row.title}
                      index={index}
                    />
                  ) : (
                    <p role="status" className="p-4 typography-meta text-muted-foreground">
                      {t(slot ? "sessionGrid.unavailable" : "sessionGrid.empty")}
                    </p>
                  )}
                </div>
                {drop?.target === index && (
                  <div
                    data-grid-drop-edge={drop.edge}
                    className={
                      drop.edge === "center"
                        ? "pointer-events-none absolute inset-2 z-20 border-2 border-primary"
                        : drop.edge === "left"
                          ? "pointer-events-none absolute bottom-0 left-0 top-0 z-20 w-1/4 border-l-4 border-primary"
                          : drop.edge === "right"
                            ? "pointer-events-none absolute bottom-0 right-0 top-0 z-20 w-1/4 border-r-4 border-primary"
                            : drop.edge === "top"
                              ? "pointer-events-none absolute left-0 right-0 top-0 z-20 h-1/4 border-t-4 border-primary"
                              : "pointer-events-none absolute bottom-0 left-0 right-0 z-20 h-1/4 border-b-4 border-primary"
                    }
                  />
                )}
              </section>
            )
          })}
          {preset && grid.layout > 1 && (
            <GridSplitter
              axis="columns"
              label={t("sessionGrid.resizeColumns")}
              ratio={preset.columns}
              extent={preset.width}
              style={preset.columnSplitter}
              onChange={(columns) => commit((current) => ({ ...current, ratios: { ...current.ratios, columns } }))}
            />
          )}
          {preset && grid.layout > 2 && (
            <GridSplitter
              axis="rows"
              label={t("sessionGrid.resizeRows")}
              ratio={preset.rows}
              extent={preset.height}
              style={preset.rowSplitter}
              onChange={(rowsRatio) => commit((current) => ({ ...current, ratios: { ...current.ratios, rows: rowsRatio } }))}
            />
          )}
          {custom?.splitters.map((splitter) => (
            <GridSplitter
              key={splitter.id}
              axis={splitter.axis === "column" ? "columns" : "rows"}
              minimum={splitter.minimumFirst}
              minimumSecond={splitter.minimumSecond}
              label={t(splitter.axis === "column" ? "sessionGrid.resizeColumns" : "sessionGrid.resizeRows")}
              ratio={splitter.ratio}
              extent={splitter.extent}
              style={{ left: splitter.left, top: splitter.top, width: splitter.width, height: splitter.height }}
              onChange={(value) =>
                commit((current) =>
                  current.tree ? { ...current, tree: updateSplitRatio(current.tree, splitter.id, value) } : current,
                )
              }
            />
          ))}
        </div>
      </div>
    </section>
  )
}
