import React from "react"

import { Icon } from "@/components/icon/Icon"
import { Button } from "@/components/ui/button"
import { MultiRunFusionDialog } from "@/components/multirun/MultiRunFusionDialog"
import { RequestActionCard } from "@/components/supervision/RequestActionCard"
import { useSupervisionRows, type SupervisionRow } from "@/hooks/useSupervisionRows"
import { useNow } from "@/hooks/useNow"
import { useI18n } from "@/lib/i18n"
import { parseMultiRunSessionTitle } from "@/lib/multirun/title"
import { openBesideChat } from "@/lib/supervision/openBesideChat"
import { openSupervisedSession } from "@/lib/supervision/openSession"
import { groupMultiRunRows, type MultiRunLane } from "@/lib/supervision/multiRunGroups"
import { requestsForSessionTree } from "@/lib/supervision/requests"
import { SupervisionStateBadge } from "./SupervisionStateBadge"
import { useSupervisionStore } from "@/stores/useSupervisionStore"
import { useAllLiveSessions, useAllPendingRequests } from "@/sync/sync-context"

const formatAge = (updatedAt: number, t: ReturnType<typeof useI18n>["t"], now: number): string | null => {
  if (!updatedAt) return null
  const elapsed = Math.max(0, now - updatedAt)
  if (elapsed < 60_000) return t("notificationCenter.time.justNow")
  const minutes = Math.floor(elapsed / 60_000)
  if (minutes < 60) return t("notificationCenter.time.minutesAgo", { count: minutes })
  const hours = Math.floor(minutes / 60)
  if (hours < 24) return t("notificationCenter.time.hoursAgo", { count: hours })
  return t("notificationCenter.time.daysAgo", { count: Math.floor(hours / 24) })
}

const openLane = (lane: MultiRunLane<SupervisionRow>, besideDiff: boolean): void => {
  // The compare overlay covers the chat until this key is cleared.
  useSupervisionStore.getState().setCompareRunGroupKey(null)
  openSupervisedSession({
    sessionId: lane.sessionId,
    projectId: lane.projectId,
    directory: lane.directory,
  })
  if (besideDiff) openBesideChat("diff")
}

export const MultiRunCompare: React.FC<{ groupKey: string }> = ({ groupKey }) => {
  const { t } = useI18n()
  const rows = useSupervisionRows()
  const sessions = useAllLiveSessions()
  const pending = useAllPendingRequests()
  const setCompareRunGroupKey = useSupervisionStore((state) => state.setCompareRunGroupKey)
  const [fusionOpen, setFusionOpen] = React.useState(false)

  const group = React.useMemo(
    () => groupMultiRunRows(rows, parseMultiRunSessionTitle).get(groupKey) ?? null,
    [groupKey, rows],
  )

  const representative = React.useMemo(() => {
    if (!group) return null
    for (const lane of group.lanes) {
      const session = sessions.find((candidate) => candidate.id === lane.sessionId)
      if (session) return session
    }
    return null
  }, [group, sessions])

  React.useEffect(() => {
    setFusionOpen(false)
  }, [groupKey])

  React.useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== "Escape" || event.defaultPrevented || fusionOpen) return
      event.preventDefault()
      setCompareRunGroupKey(null)
    }
    window.addEventListener("keydown", onKeyDown)
    return () => window.removeEventListener("keydown", onKeyDown)
  }, [fusionOpen, setCompareRunGroupKey])

  const laneCount = group?.lanes.length ?? 0

  return (
    <div className="flex h-full min-h-0 flex-col bg-background" data-multi-run-compare={groupKey}>
      <header className="flex shrink-0 items-center gap-3 border-b border-border/60 px-4 py-3">
        <Button variant="ghost" size="sm" onClick={() => setCompareRunGroupKey(null)}>
          <Icon name="arrow-left" />
          {t("supervision.compare.back")}
        </Button>
        <h2 className="min-w-0 flex-1 truncate typography-ui-label font-medium text-foreground">
          {group?.label ?? groupKey}
        </h2>
        <span className="typography-micro text-muted-foreground">
          {t("supervision.compare.laneCount", { count: laneCount })}
        </span>
      </header>

      {group && laneCount > 0 ? (
        <div className="grid min-h-0 flex-1 auto-rows-max grid-cols-1 gap-3 overflow-y-auto p-4 sm:grid-cols-2 xl:grid-cols-3">
          {group.lanes.map((lane) => (
            <LaneCard
              key={lane.sessionId}
              lane={lane}
              requests={requestsForSessionTree(pending, new Set(lane.treeSessionIds))}
              onOpen={() => openLane(lane, false)}
              onReview={() => openLane(lane, true)}
            />
          ))}
        </div>
      ) : (
        <div className="flex flex-1 items-center justify-center p-6">
          <p className="typography-ui-label text-muted-foreground">{t("supervision.compare.empty")}</p>
        </div>
      )}

      <footer className="flex shrink-0 justify-end border-t border-border/60 px-4 py-3">
        <Button variant="outline" size="sm" disabled={!representative} onClick={() => setFusionOpen(true)}>
          <Icon name="git-merge" />
          {t("supervision.compare.fuse")}
        </Button>
      </footer>

      {representative ? (
        <MultiRunFusionDialog session={representative} open={fusionOpen} onOpenChange={setFusionOpen} />
      ) : null}
    </div>
  )
}

const LaneCard: React.FC<{
  lane: MultiRunLane<SupervisionRow>
  requests: ReturnType<typeof requestsForSessionTree>
  onOpen: () => void
  onReview: () => void
}> = ({ lane, requests, onOpen, onReview }) => {
  const { t } = useI18n()
  // Relative age follows the shared clock so it cannot be memoized at mount.
  const now = useNow()
  const age = formatAge(lane.updatedAt, t, now)
  const evidence = lane.evidence
    ? `+${lane.evidence.additions} −${lane.evidence.deletions} · ${t("supervision.compare.files", { count: lane.evidence.files })}`
    : null

  return (
    <article className="flex min-w-0 flex-col gap-3 rounded-xl border border-border/60 p-3 surface-inset">
      <div className="flex min-w-0 items-start justify-between gap-2">
        <h3 className="min-w-0 truncate typography-ui-label font-medium text-foreground">{lane.laneLabel}</h3>
        <SupervisionStateBadge state={lane.state} />
      </div>
      <div className="flex min-w-0 items-center gap-2 typography-micro text-muted-foreground">
        {evidence ? <span className="min-w-0 truncate">{evidence}</span> : null}
        {age ? <span className="shrink-0">{age}</span> : null}
      </div>
      {requests.map((entry) => (
        <RequestActionCard key={`${entry.kind}:${entry.request.id}`} entry={entry} density="compact" onOpen={onOpen} />
      ))}
      <div className="mt-auto flex flex-wrap items-center gap-2">
        <Button size="sm" onClick={onOpen}>
          {t("supervision.compare.open")}
        </Button>
        <Button size="sm" variant="outline" onClick={onReview}>
          {t("supervision.compare.reviewChanges")}
        </Button>
      </div>
    </article>
  )
}
