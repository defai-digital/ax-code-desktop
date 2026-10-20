import React from "react"

import { Icon } from "@/components/icon/Icon"
import { Button } from "@/components/ui/button"
import type { SupervisionRow as SupervisionRowData } from "@/hooks/useSupervisionRows"
import { useI18n } from "@/lib/i18n"
import { parseMultiRunSessionTitle } from "@/lib/multirun/title"
import { multiRunGroupKeyForRow } from "@/lib/supervision/multiRunGroups"
import { formatRelativeAge } from "@/lib/supervision/relativeAge"
import { SupervisionGoalLine } from "../SupervisionGoalLine"
import { SupervisionStateBadge } from "../SupervisionStateBadge"
import { cn } from "@/lib/utils"
import { EvidenceText } from "../EvidenceText"

export interface MissionControlRowProps {
  row: SupervisionRowData
  selected: boolean
  expanded: boolean
  activeWorkingSetId: string | null
  primaryLabel: string
  onSelect: (sessionId: string) => void
  onOpen: (row: SupervisionRowData) => void
  onPrimary: (row: SupervisionRowData) => void
  /** Opens multi-run compare; omitted where compare cannot open (the pop-out window). */
  onCompare?: (groupKey: string) => void
  onRemoveFromSet: (workingSetId: string, sessionId: string) => void
  children?: React.ReactNode
}

export const MissionControlRow: React.FC<MissionControlRowProps> = ({
  row,
  selected,
  expanded,
  activeWorkingSetId,
  primaryLabel,
  onSelect,
  onOpen,
  onPrimary,
  onCompare,
  onRemoveFromSet,
  children,
}) => {
  const { t } = useI18n()
  const groupSlug = multiRunGroupKeyForRow(row, parseMultiRunSessionTitle)

  const handleSelectClick = (event: React.MouseEvent<HTMLDivElement>) => {
    onSelect(row.sessionId)
    // The board (role="grid") owns keyboard navigation via aria-activedescendant;
    // move DOM focus there so j/k and arrow keys continue from this row.
    event.currentTarget.closest<HTMLElement>('[role="grid"]')?.focus({ preventScroll: true })
  }

  const handleDoubleClick = () => {
    onOpen(row)
  }

  const handleActionDoubleClick = (event: React.MouseEvent) => {
    event.stopPropagation()
  }

  const handleCompareClick = (event: React.MouseEvent) => {
    event.stopPropagation()
    if (groupSlug && onCompare) {
      onCompare(groupSlug)
    }
  }

  const handlePrimaryClick = (event: React.MouseEvent) => {
    event.stopPropagation()
    onPrimary(row)
  }

  const handleRemoveClick = (event: React.MouseEvent) => {
    event.stopPropagation()
    if (activeWorkingSetId) {
      onRemoveFromSet(activeWorkingSetId, row.sessionId)
    }
  }

  return (
    <div className="border-b border-border/50">
      <div
        id={`mission-row-${row.sessionId}`}
        role="row"
        aria-selected={selected}
        aria-expanded={expanded}
        onClick={handleSelectClick}
        onDoubleClick={handleDoubleClick}
        className={cn("mission-control-row cursor-pointer", selected && "bg-interactive-hover/50")}
      >
        <span role="gridcell" className="mission-state">
          <SupervisionStateBadge state={row.state} />
        </span>
        <span role="gridcell" className="mission-title min-w-0">
          <span className="block typography-ui-label text-foreground [overflow-wrap:anywhere]" title={row.title}>
            {row.title}
          </span>
          {row.state === "error" && row.errorMessage ? (
            <span className="block typography-meta text-muted-foreground [overflow-wrap:anywhere]">
              {row.errorMessage}
            </span>
          ) : null}
          <SupervisionGoalLine goal={row.goal} className="typography-meta text-muted-foreground" />
        </span>
        <span
          role="gridcell"
          className="mission-project min-w-0 typography-meta text-muted-foreground [overflow-wrap:anywhere]"
        >
          {row.projectLabel ?? "\u2014"}
        </span>
        <span
          role="gridcell"
          className="mission-evidence min-w-0 typography-meta text-muted-foreground [overflow-wrap:anywhere]"
        >
          <EvidenceText evidence={row.evidence} />
        </span>
        <span role="gridcell" className="mission-age typography-meta text-muted-foreground">
          {row.updatedAt ? formatRelativeAge(Date.now() - row.updatedAt, t) : "\u2014"}
        </span>
        <span role="gridcell" className="mission-actions flex min-w-0 flex-wrap items-center gap-2">
          {groupSlug && onCompare ? (
            <button
              type="button"
              onClick={handleCompareClick}
              onDoubleClick={handleActionDoubleClick}
              className="shrink-0 typography-micro text-[var(--status-info)] hover:underline"
            >
              {t("supervision.missionControl.action.compare")}
            </button>
          ) : null}
          <Button
            size="sm"
            className="min-h-8 h-auto whitespace-normal px-3 py-1 typography-meta"
            onClick={handlePrimaryClick}
            onDoubleClick={handleActionDoubleClick}
            aria-label={`${primaryLabel} \u2014 ${row.title}`}
          >
            {primaryLabel}
          </Button>
          {activeWorkingSetId ? (
            <button
              type="button"
              aria-label={t("supervision.missionControl.action.removeFromSet")}
              title={t("supervision.missionControl.action.removeFromSet")}
              onClick={handleRemoveClick}
              onDoubleClick={handleActionDoubleClick}
              className="shrink-0 rounded p-1 text-muted-foreground hover:text-destructive"
            >
              <Icon name="close" className="h-3.5 w-3.5" aria-hidden="true" />
            </button>
          ) : null}
        </span>
      </div>
      {expanded ? children : null}
    </div>
  )
}
