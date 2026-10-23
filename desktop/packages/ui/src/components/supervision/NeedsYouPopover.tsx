import React from "react"
import { WebMcpWaitingPages } from "@/components/mcp/WebMcpPages"
import { useWebMcpPages } from "@/hooks/useWebMcpPages"

import { Button } from "@/components/ui/button"
import { Icon } from "@/components/icon/Icon"
import { useI18n } from "@/lib/i18n"
import { formatShortcutForDisplay, getEffectiveShortcutCombo } from "@/lib/shortcuts"
import {
  formatSupervisionEvidenceLine,
  groupRequestsBySupervisionRoot,
  supervisionRequestContext,
  supervisionStatusRows,
} from "@/lib/supervision/needsYouSurface"
import { openSupervisedSession } from "@/lib/supervision/openSession"
import { openBesideChat } from "@/lib/supervision/openBesideChat"
import { useSupervisionRows } from "@/hooks/useSupervisionRows"
import { useSupervisionStore } from "@/stores/useSupervisionStore"
import { useUIStore } from "@/stores/useUIStore"
import { useAllPendingRequests, type PendingRequestEntry } from "@/sync/sync-context"
import type { SupervisionRow } from "@/hooks/useSupervisionRows"

import { permissionBatches } from "@/lib/supervision/batchRequests"
import { requestDecisionKey, useRequestDecisionStore } from "@/stores/useRequestDecisionStore"

import { PermissionBatchBar } from "./PermissionBatchBar"
import { RequestActionCard } from "./RequestActionCard"
import { SupervisionGoalLine } from "./SupervisionGoalLine"

type NeedsYouPopoverProps = {
  onClose: () => void
}

const evidenceLabel = (row: SupervisionRow, t: ReturnType<typeof useI18n>["t"]): string | null => {
  const evidence = row.evidence
  if (!evidence || evidence.files <= 0) {
    return formatSupervisionEvidenceLine(evidence, "")
  }
  const filesLabel =
    evidence.files === 1
      ? t("supervision.evidence.file", { count: evidence.files })
      : t("supervision.evidence.files", { count: evidence.files })
  return formatSupervisionEvidenceLine(evidence, filesLabel)
}

/**
 * Cross-session interruptions. Request cards send allow / deny / answer intents. Standing grants stay
 * on the in-session card. A positioned panel, not a menu: the action buttons must not be treated as
 * menu items that close or steal the click.
 */
export const NeedsYouPopover: React.FC<NeedsYouPopoverProps> = ({ onClose }) => {
  const { t } = useI18n()
  const panelRef = React.useRef<HTMLDivElement>(null)
  const rows = useSupervisionRows()
  const requests = useAllPendingRequests()
  const shortcutOverrides = useUIStore((state) => state.shortcutOverrides)
  const nextShortcut = formatShortcutForDisplay(getEffectiveShortcutCombo("next_needs_you", shortcutOverrides))

  const { groups, unmatched } = React.useMemo(() => groupRequestsBySupervisionRoot(rows, requests), [requests, rows])
  const statusRows = React.useMemo(
    () => supervisionStatusRows(rows, new Set(groups.map((group) => group.row.sessionId))),
    [groups, rows],
  )
  const waiting = useWebMcpPages().filter((page) => page.waiting && !page.visible)
  const empty = waiting.length === 0 && groups.length === 0 && unmatched.length === 0 && statusRows.length === 0
  const decisionRecords = useRequestDecisionStore((state) => state.records)
  // Batch in the inbox's own order, and leave out requests another surface is already answering.
  const batches = React.useMemo(() => {
    const ordered = [...groups.flatMap((group) => group.requests), ...unmatched]
    return permissionBatches(ordered, (entry) => {
      const phase = decisionRecords.get(
        requestDecisionKey({ kind: "permission", sessionId: entry.sessionId, requestId: entry.request.id }),
      )?.phase
      return phase === undefined || phase === "idle" || phase === "retry"
    })
  }, [decisionRecords, groups, unmatched])

  React.useEffect(() => {
    const previouslyFocused = document.activeElement instanceof HTMLElement ? document.activeElement : null
    panelRef.current?.focus()
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose()
    }
    document.addEventListener("keydown", handleKeyDown)
    return () => {
      document.removeEventListener("keydown", handleKeyDown)
      previouslyFocused?.focus()
    }
  }, [onClose])

  const openSession = React.useCallback((row: Pick<SupervisionRow, "sessionId" | "projectId" | "directory">) => {
    openSupervisedSession({ sessionId: row.sessionId, projectId: row.projectId, directory: row.directory })
  }, [])

  const openRequest = React.useCallback((entry: PendingRequestEntry, row?: SupervisionRow) => {
    openSupervisedSession({
      sessionId: row?.sessionId ?? entry.sessionId,
      projectId: row?.projectId,
      directory: row?.directory,
    })
  }, [])

  const openMissionControl = React.useCallback(() => {
    const supervision = useSupervisionStore.getState()
    supervision.setCompareRunGroupKey(null)
    supervision.setMissionControlOpen(true)
    supervision.setNeedsYouPopoverOpen(false)
  }, [])

  return (
    <>
      <div className="app-region-no-drag fixed inset-0 z-40" onClick={onClose} />
      <div
        ref={panelRef}
        tabIndex={-1}
        role="dialog"
        aria-label={t("supervision.needsYou.openEmptyAria")}
        className="app-region-no-drag absolute right-0 top-full z-50 mt-1.5 flex w-[380px] max-w-[calc(100vw-1rem)] max-h-[460px] flex-col overflow-hidden rounded-xl border border-border bg-[var(--surface-elevated)] text-[var(--surface-elevated-foreground)] shadow-popover outline-none"
      >
        <div className="max-h-[400px] overflow-y-auto p-1.5">
          <WebMcpWaitingPages />
          {empty ? (
            <div className="flex flex-col items-center justify-center gap-2 px-4 py-8 text-center">
              <Icon name="checkbox-circle" className="h-5 w-5 text-muted-foreground" aria-hidden="true" />
              <p className="typography-ui-label text-muted-foreground">{t("supervision.needsYou.empty")}</p>
            </div>
          ) : (
            <div className="flex flex-col gap-1.5">
              {batches.map((batch) => (
                <PermissionBatchBar key={`batch:${batch.permission}`} batch={batch} />
              ))}
              {groups.map((group) =>
                group.requests.map((entry) => (
                  <RequestActionCard
                    key={`${group.row.sessionId}:${entry.kind}:${entry.request.id}`}
                    entry={entry}
                    density="compact"
                    context={supervisionRequestContext(group.row.title, group.row.projectLabel)}
                    onOpen={() => openRequest(entry, group.row)}
                  />
                )),
              )}
              {unmatched.map((entry) => (
                <RequestActionCard
                  key={`unmatched:${entry.kind}:${entry.request.id}`}
                  entry={entry}
                  density="compact"
                  context={t("supervision.needsYou.unknownSession")}
                  onOpen={() => openRequest(entry)}
                />
              ))}
              {statusRows.map((row) => {
                const line = evidenceLabel(row, t)
                return (
                  <button
                    key={row.sessionId}
                    type="button"
                    onClick={() => {
                      openSession(row)
                      if (row.state === "review") openBesideChat("diff")
                    }}
                    className="flex w-full min-w-0 flex-col gap-0.5 rounded-lg px-2.5 py-2 text-left hover:bg-interactive-hover focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--interactive-focus-ring)]"
                  >
                    <span className="flex min-w-0 items-center gap-2">
                      <span className="min-w-0 flex-1 truncate typography-ui-label text-foreground">{row.title}</span>
                      <span className="shrink-0 typography-micro text-[var(--status-warning)]">
                        {row.state === "error"
                          ? t("projects.home.needsYou.error")
                          : row.state === "goal"
                            ? t("supervision.state.goal")
                            : t("supervision.state.review")}
                      </span>
                    </span>
                    {row.state === "error" && row.errorMessage ? (
                      <span className="block w-full min-w-0 truncate typography-micro text-muted-foreground">
                        {row.errorMessage}
                      </span>
                    ) : null}
                    <SupervisionGoalLine goal={row.goal} className="typography-micro text-muted-foreground" />
                    {row.projectLabel || line ? (
                      <span className="flex min-w-0 items-center gap-2 typography-micro text-muted-foreground">
                        {row.projectLabel ? <span className="min-w-0 truncate">{row.projectLabel}</span> : null}
                        {line ? <span className="shrink-0">{line}</span> : null}
                      </span>
                    ) : null}
                  </button>
                )
              })}
            </div>
          )}
        </div>
        <div className="flex shrink-0 items-center justify-between gap-2 border-t border-border/60 px-2 py-1.5">
          <Button size="sm" variant="ghost" className="h-7 px-2 typography-micro" onClick={openMissionControl}>
            {t("supervision.needsYou.openMissionControl")}
          </Button>
          <span className="shrink-0 typography-micro text-muted-foreground">
            {t("supervision.needsYou.nextShortcut", { shortcut: nextShortcut })}
          </span>
        </div>
      </div>
    </>
  )
}
