import { MissionControlPullRequest } from "./MissionControlPullRequest"
import React from "react"

import { Button } from "@/components/ui/button"
import type { SupervisionRow } from "@/hooks/useSupervisionRows"
import { useNow } from "@/hooks/useNow"
import { formatPathForDisplay } from "@/lib/utils"
import { useDirectoryStore } from "@/stores/useDirectoryStore"
import { useI18n } from "@/lib/i18n"
import { updatedSinceViewed } from "@/lib/supervision/missionControl"
import { useSupervisionStore } from "@/stores/useSupervisionStore"
import { recentHookRuns, useSessionHookRuns } from "@/stores/useHookActivityStore"
import type { WorkingSet } from "@/stores/useSupervisionStore"
import type { PendingRequestEntry } from "@/sync/sync-context"
import { formatRelativeAge } from "@/lib/supervision/relativeAge"
import { SupervisionStateBadge } from "../SupervisionStateBadge"
import { EvidenceText } from "../EvidenceText"
import { RequestActionCard } from "../RequestActionCard"
import { SupervisionGoalLine } from "../SupervisionGoalLine"
import { ChecksDetail, GoalBudgetLeft } from "./MissionControlChecks"

export interface MissionControlPeekProps {
  row: SupervisionRow
  requests: readonly PendingRequestEntry[]
  workingSets: readonly WorkingSet[]
  isCreatingSetForRow: boolean
  newSetName: string
  onNewSetNameChange: (value: string) => void
  onOpen: (row: SupervisionRow) => void
  /** Opens the changes beside the chat; omitted where there is no chat (the pop-out window). */
  onReviewChanges?: (row: SupervisionRow) => void
  /** Shows this session beside the current chat in the same window; omitted in the pop-out window. */
  onOpenBeside?: (row: SupervisionRow) => void
  onAddToWorkingSet: (workingSetId: string, sessionId: string) => void
  onStartCreateSet: (sessionId: string) => void
  onSubmitCreateSet: (row: SupervisionRow) => void
  onCancelCreateSet: () => void
}

export const MissionControlPeek: React.FC<MissionControlPeekProps> = ({
  row,
  requests,
  workingSets,
  isCreatingSetForRow,
  newSetName,
  onNewSetNameChange,
  onOpen,
  onReviewChanges,
  onOpenBeside,
  onAddToWorkingSet,
  onStartCreateSet,
  onSubmitCreateSet,
  onCancelCreateSet,
}) => {
  const { t } = useI18n()
  // Child ages are relative to the shared clock, so they keep advancing while peeked.
  const now = useNow()
  const updated = useSupervisionStore((state) => updatedSinceViewed(row, state.lastViewedAt))
  const homeDirectory = useDirectoryStore((s) => s.homeDirectory)
  const recentRuns = recentHookRuns(useSessionHookRuns(row.sessionId))

  const handleOpenClick = () => {
    onOpen(row)
  }

  const handleReviewChangesClick = () => {
    onReviewChanges?.(row)
  }

  const handleWorkingSetChange = (event: React.ChangeEvent<HTMLSelectElement>) => {
    const value = event.target.value
    if (value === "__new__") {
      onStartCreateSet(row.sessionId)
      return
    }
    if (value) {
      onAddToWorkingSet(value, row.sessionId)
    }
  }

  const handleNewSetKeyDown = (event: React.KeyboardEvent<HTMLInputElement>) => {
    if (event.key === "Enter") {
      onSubmitCreateSet(row)
    }
    if (event.key === "Escape") {
      event.stopPropagation()
      onCancelCreateSet()
    }
  }

  const handleCreateSetClick = () => {
    onSubmitCreateSet(row)
  }

  return (
    <div className="mission-control-peek max-h-80 min-w-0 overflow-y-auto px-4 pb-3">
      <div className="flex flex-col gap-2">
        {requests.length ? (
          requests.map((entry) => (
            <RequestActionCard
              key={`${entry.kind}-${entry.request.id}`}
              entry={entry}
              density="full"
              onOpen={handleOpenClick}
            />
          ))
        ) : (
          <p className="typography-micro text-muted-foreground">
            {t("supervision.missionControl.peek.noPendingRequests")}
          </p>
        )}
        {row.childSessions?.length ? (
          <ul aria-label={t("supervision.missionControl.child.title")} className="mission-child-list space-y-1">
            {row.childSessions.map((child) => (
              <li
                key={child.sessionId}
                className="flex min-w-0 flex-wrap items-center gap-2 rounded bg-muted/30 px-2 py-1"
              >
                <span className="min-w-0 flex-1 truncate typography-meta" title={child.title}>
                  {child.title}
                </span>
                <SupervisionStateBadge state={child.state} />
                {child.updatedAt ? (
                  <span className="typography-micro text-muted-foreground">
                    {formatRelativeAge(now - child.updatedAt, t)}
                  </span>
                ) : null}
              </li>
            ))}
          </ul>
        ) : null}
        {row.goal ? (
          <div className="flex min-w-0 flex-col gap-0.5">
            {row.state === "goal" ? (
              <span className="typography-micro text-[var(--status-warning)]">{t("supervision.state.goal")}</span>
            ) : null}
            <SupervisionGoalLine goal={row.goal} className="typography-micro text-muted-foreground" />
            <GoalBudgetLeft goal={row.goal} />
          </div>
        ) : null}
        <MissionControlPullRequest pr={row.pullRequest} />
        {row.checks ? <ChecksDetail checks={row.checks} /> : null}
        <EvidenceText fallback="none" evidence={row.evidence} className="typography-micro text-muted-foreground" />
        {recentRuns.length ? (
          <div className="flex flex-col gap-1">
            <p className="typography-micro text-muted-foreground">
              {t("supervision.missionControl.peek.hookRunsTitle")}
            </p>
            {recentRuns.map((run) => (
              <p key={run.id} data-hook-run="true" className="truncate typography-micro text-muted-foreground">
                <span className="text-foreground/80">
                  {t(`supervision.hookOutcome.${run.outcome}` as Parameters<typeof t>[0])}
                </span>{" "}
                {run.event}
                {run.tool ? ` · ${run.tool}` : ""}
              </p>
            ))}
          </div>
        ) : null}
        {row.directory ? (
          <p className="truncate typography-micro text-muted-foreground" title={row.directory}>
            {formatPathForDisplay(row.directory, homeDirectory)}
          </p>
        ) : null}
        <div className="flex flex-wrap items-center gap-1.5">
          <Button
            size="sm"
            className="normal-case h-auto min-h-6 max-w-full whitespace-normal px-2 py-1 typography-micro"
            onClick={handleOpenClick}
          >
            {t("supervision.missionControl.action.openSession")}
          </Button>
          {updated ? null : (
            <Button
              size="sm"
              variant="ghost"
              className="normal-case h-auto min-h-6 max-w-full whitespace-normal px-2 py-1 typography-micro"
              onClick={() => useSupervisionStore.getState().markSessionUnread(row.sessionId)}
            >
              {t("supervision.missionControl.action.markUnread")}
            </Button>
          )}
          {onOpenBeside ? (
            <Button
              size="sm"
              variant="outline"
              className="normal-case h-auto min-h-6 max-w-full whitespace-normal px-2 py-1 typography-micro"
              title={t("supervision.missionControl.action.openBesideHint")}
              onClick={() => onOpenBeside(row)}
            >
              {t("supervision.missionControl.action.openBeside")}
            </Button>
          ) : null}
          {row.evidence && onReviewChanges ? (
            <Button
              size="sm"
              variant="outline"
              className="normal-case h-auto min-h-6 max-w-full whitespace-normal px-2 py-1 typography-micro"
              onClick={handleReviewChangesClick}
            >
              {t("supervision.missionControl.action.reviewChanges")}
            </Button>
          ) : null}
          <select
            aria-label={t("supervision.missionControl.action.addToWorkingSet")}
            value=""
            onChange={handleWorkingSetChange}
            className="h-6 min-w-0 max-w-full rounded border border-border bg-background px-1.5 typography-micro text-foreground"
          >
            <option value="">{t("supervision.missionControl.action.addToWorkingSet")}</option>
            {workingSets.map((workingSet) => (
              <option key={workingSet.id} value={workingSet.id}>
                {workingSet.name}
              </option>
            ))}
            <option value="__new__">{t("supervision.missionControl.action.newWorkingSetOption")}</option>
          </select>
          {isCreatingSetForRow ? (
            <span className="flex min-w-0 max-w-full flex-wrap items-center gap-1">
              <input
                autoFocus
                value={newSetName}
                onChange={(event) => onNewSetNameChange(event.target.value)}
                onKeyDown={handleNewSetKeyDown}
                placeholder={t("supervision.missionControl.workingSetNamePlaceholder")}
                aria-label={t("supervision.missionControl.workingSetNamePlaceholder")}
                className="h-6 w-32 min-w-0 max-w-full rounded border border-border bg-background px-1.5 typography-micro text-foreground outline-none"
              />
              <Button
                size="sm"
                className="normal-case h-auto min-h-6 max-w-full whitespace-normal px-2 py-1 typography-micro"
                onClick={handleCreateSetClick}
              >
                {t("supervision.missionControl.createWorkingSet")}
              </Button>
            </span>
          ) : null}
        </div>
      </div>
    </div>
  )
}
