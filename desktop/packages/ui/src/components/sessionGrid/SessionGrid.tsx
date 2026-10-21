import React from "react"
import { WebMcpSessionPage } from "@/components/mcp/WebMcpPages"
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
import { resizeGridSlots,
  resolveGridSession,
  sessionGridGeometry,
  type SessionGridLayout,
  type SessionGridSlot,
} from "@/lib/supervision/sessionGrid"
import { useUIStore } from "@/stores/useUIStore"
import { SupervisionStateBadge } from "@/components/supervision/SupervisionStateBadge"
import { GridSplitter } from "./GridSplitter"

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
  const setGrid = useUIStore((s) => s.setSessionGrid)
  const rows = useSupervisionRows()
  const container = React.useRef<HTMLDivElement>(null)
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
  const geometry = sessionGridGeometry(grid.layout, size.width, size.height, grid.ratios)
  const replace = (index: number, slot: SessionGridSlot | null) =>
    setGrid({ ...grid, slots: grid.slots.map((old, i) => (i === index ? slot : old)) })
  return (
    <section className="flex h-full min-h-0 flex-col" aria-label={t("sessionGrid.title")} data-session-grid>
      <header className="flex shrink-0 flex-wrap items-center gap-3 border-b border-border p-2">
        <h2 className="typography-ui-label">{t("sessionGrid.title")}</h2>
        <label className="typography-meta">
          {t("sessionGrid.layout")}{" "}
          <select
            className="rounded border border-border bg-background p-1"
            value={grid.layout}
            onChange={(event) => {
              const layout = Number(event.target.value) as SessionGridLayout
              setGrid({ ...grid, layout, slots: resizeGridSlots(grid.slots, layout) })
            }}
          >
            <option value={1}>{t("sessionGrid.layout.one")}</option>
            <option value={2}>{t("sessionGrid.layout.two")}</option>
            <option value={3}>{t("sessionGrid.layout.three")}</option>
            <option value={4}>{t("sessionGrid.layout.four")}</option>
          </select>
        </label>
      </header>
      <div ref={container} className="min-h-0 flex-1 overflow-auto">
        <div className="relative" style={{ width: geometry.width, height: geometry.height }}>
          {grid.slots.map((slot, index) => {
            const row = resolveGridSession(slot, rows)
            const candidates = rows.filter(
              (candidate) =>
                normalizeProjectPath(candidate.directory) &&
                !grid.slots.some((other, i) => i !== index && resolveGridSession(other, [candidate])),
            )
            return (
              <section
                key={index}
                aria-label={t("sessionGrid.pane", { count: index + 1 })}
                className="absolute flex min-h-0 flex-col overflow-hidden bg-background"
                style={geometry.panes[index]}
              >
                <header className="flex shrink-0 flex-wrap items-center gap-2 border-b border-border p-2">
                  <div className="min-w-24 flex-1">
                    <div className="truncate typography-ui-label" title={row?.title}>
                      {row?.title ?? t("sessionGrid.add")}
                    </div>
                    {row && (
                      <div className="truncate typography-meta text-muted-foreground" title={row.directory ?? ""}>
                        {row.projectLabel || row.directory}
                      </div>
                    )}
                  </div>
                  {slot && <WebMcpSessionPage directory={slot.directory} sessionID={slot.sessionId} />}
                  {row && <SupervisionStateBadge state={row.state} />}
                  {row && (
                    <button
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
                  {slot && (
                    <button
                      className="rounded border border-border px-2 py-1 typography-meta"
                      onClick={(event) => {
                        // The button disappears with the session; keep keyboard focus in this pane, on its picker.
                        const pane = event.currentTarget.closest("section")
                        replace(index, null)
                        requestAnimationFrame(() => pane?.querySelector<HTMLSelectElement>("select")?.focus())
                      }}
                    >
                      {t("sessionGrid.close")}
                    </button>
                  )}
                </header>
                <div className="min-h-0 flex-1">
                  {row && slot ? (
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
              </section>
            )
          })}
          {grid.layout > 1 && (
            <GridSplitter
              axis="columns"
              label={t("sessionGrid.resizeColumns")}
              ratio={geometry.columns}
              extent={geometry.width}
              style={geometry.columnSplitter}
              onChange={(columns) => setGrid({ ...grid, ratios: { ...grid.ratios, columns } })}
            />
          )}
          {grid.layout > 2 && (
            <GridSplitter
              axis="rows"
              label={t("sessionGrid.resizeRows")}
              ratio={geometry.rows}
              extent={geometry.height}
              style={geometry.rowSplitter}
              onChange={(rows) => setGrid({ ...grid, ratios: { ...grid.ratios, rows } })}
            />
          )}
        </div>
      </div>
    </section>
  )
}
