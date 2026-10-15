import React from "react"

import { Button } from "@/components/ui/button"
import type { SupervisionRow } from "@/hooks/useSupervisionRows"
import { useI18n } from "@/lib/i18n"
import type { WorkingSet } from "@/stores/useSupervisionStore"
import type { PendingRequestEntry } from "@/sync/sync-context"
import { EvidenceText } from "../EvidenceText"
import { RequestActionCard } from "../RequestActionCard"

export interface MissionControlPeekProps {
  row: SupervisionRow
  requests: readonly PendingRequestEntry[]
  workingSets: readonly WorkingSet[]
  isCreatingSetForRow: boolean
  newSetName: string
  onNewSetNameChange: (value: string) => void
  onOpen: (row: SupervisionRow) => void
  onReviewChanges: (row: SupervisionRow) => void
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
  onAddToWorkingSet,
  onStartCreateSet,
  onSubmitCreateSet,
  onCancelCreateSet,
}) => {
  const { t } = useI18n()

  const handleOpenClick = () => {
    onOpen(row)
  }

  const handleReviewChangesClick = () => {
    onReviewChanges(row)
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
    <div className="max-h-80 overflow-y-auto px-4 pb-3 pl-36">
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
        <EvidenceText evidence={row.evidence} className="typography-micro text-muted-foreground" />
        {row.directory ? (
          <p className="truncate typography-micro text-muted-foreground" title={row.directory}>
            {row.directory}
          </p>
        ) : null}
        <div className="flex flex-wrap items-center gap-1.5">
          <Button size="sm" className="h-6 px-2 typography-micro" onClick={handleOpenClick}>
            {t("supervision.missionControl.action.openSession")}
          </Button>
          {row.evidence ? (
            <Button
              size="sm"
              variant="outline"
              className="h-6 px-2 typography-micro"
              onClick={handleReviewChangesClick}
            >
              {t("supervision.missionControl.action.reviewChanges")}
            </Button>
          ) : null}
          <select
            aria-label={t("supervision.missionControl.action.addToWorkingSet")}
            value=""
            onChange={handleWorkingSetChange}
            className="h-6 rounded border border-border bg-background px-1.5 typography-micro text-foreground"
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
            <span className="flex items-center gap-1">
              <input
                autoFocus
                value={newSetName}
                onChange={(event) => onNewSetNameChange(event.target.value)}
                onKeyDown={handleNewSetKeyDown}
                placeholder={t("supervision.missionControl.workingSetNamePlaceholder")}
                aria-label={t("supervision.missionControl.workingSetNamePlaceholder")}
                className="h-6 w-32 rounded border border-border bg-background px-1.5 typography-micro text-foreground outline-none"
              />
              <Button size="sm" className="h-6 px-2 typography-micro" onClick={handleCreateSetClick}>
                {t("supervision.missionControl.createWorkingSet")}
              </Button>
            </span>
          ) : null}
        </div>
      </div>
    </div>
  )
}
