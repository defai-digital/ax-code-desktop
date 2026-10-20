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
import { cn, formatPathForDisplay } from "@/lib/utils"
import { needsHuman } from "@/lib/supervision/sessionState"
import { useDirectoryStore } from "@/stores/useDirectoryStore"
import { useGitBranchLabel } from "@/stores/useGitStore"
import { useFormatEvidence } from "../EvidenceText"

export interface MissionControlRowProps {
  row: SupervisionRowData
  grouped?: boolean
  selected: boolean
  expanded: boolean
  activeWorkingSetId: string | null
  primaryLabel: string
  onToggleDetails: (sessionId: string) => void
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
  grouped = false,
  selected,
  expanded,
  activeWorkingSetId,
  primaryLabel,
  onToggleDetails,
  onSelect,
  onOpen,
  onPrimary,
  onCompare,
  onRemoveFromSet,
  children,
}) => {
  const { t } = useI18n()
  const homeDirectory = useDirectoryStore((s) => s.homeDirectory)
  const branch = useGitBranchLabel(row.directory)
  const formatEvidence = useFormatEvidence()
  const evidenceLabel = formatEvidence(row.evidence)
  const actionContext = [row.projectLabel ?? row.directory, row.title].filter(Boolean).join(" · ")
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
    // Presentational wrapper: the grid owns rows directly, and the details disclosure is its own row.
    <div role="presentation" className="border-b border-border/50">
      <div
        id={`mission-row-${row.sessionId}`}
        role="row"
        aria-selected={selected}
        aria-expanded={expanded}
        onClick={handleSelectClick}
        onDoubleClick={handleDoubleClick}
        className={cn(
          "mission-control-row cursor-pointer border-l-2",
          row.state === "error"
            ? "border-l-[var(--status-error)]"
            : needsHuman(row.state)
              ? "border-l-[var(--status-warning)]"
              : "border-l-transparent",
          selected && "bg-interactive-hover/50",
        )}
      >
        <span role="gridcell" className="mission-state">
          <SupervisionStateBadge state={row.state} />
        </span>
        <span role="gridcell" className="mission-title min-w-0">
          <span className="block truncate typography-ui-label text-foreground" title={row.title}>
            {row.title}
          </span>
        </span>
        {row.goal || (row.state === "error" && row.errorMessage) ? (
          <span
            role="gridcell"
            className="mission-description min-w-0 typography-meta text-muted-foreground [overflow-wrap:anywhere]"
          >
            {row.state === "error" && row.errorMessage ? <span className="block">{row.errorMessage}</span> : null}
            <SupervisionGoalLine goal={row.goal} className="typography-meta text-muted-foreground" />
          </span>
        ) : null}
        <span
          role="gridcell"
          className="mission-meta flex min-w-0 flex-wrap items-center gap-x-2 gap-y-1 typography-meta text-muted-foreground"
        >
          {!grouped && (row.projectLabel || row.directory) ? (
            <span className="mission-project min-w-0 truncate" title={row.directory ?? undefined}>
              {row.projectLabel}
              {row.projectLabel && row.directory ? " · " : ""}
              {formatPathForDisplay(row.directory, homeDirectory)}
            </span>
          ) : null}
          {branch ? (
            <span className="mission-branch inline-flex min-w-0 items-center gap-1" title={branch}>
              <Icon name="git-branch" className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
              <span className="truncate">{branch}</span>
            </span>
          ) : null}
          {evidenceLabel && row.evidence ? (
            <span className="mission-evidence min-w-0">
              <span className="text-[var(--status-success)]">+{row.evidence.additions}</span>{" "}
              <span className="text-[var(--status-error)]">−{row.evidence.deletions}</span>
              {" · "}
              {t(
                row.evidence.files === 1
                  ? "supervision.missionControl.filesSingle"
                  : "supervision.missionControl.filesPlural",
                { count: row.evidence.files },
              )}
            </span>
          ) : null}
          {row.updatedAt ? (
            <span className="mission-age">{formatRelativeAge(Date.now() - row.updatedAt, t)}</span>
          ) : null}
        </span>
        <span role="gridcell" className="mission-actions flex min-w-0 flex-wrap items-center gap-2">
          {groupSlug && onCompare ? (
            <button
              type="button"
              aria-label={`${t("supervision.missionControl.action.compare")} — ${actionContext}`}
              onClick={handleCompareClick}
              onDoubleClick={handleActionDoubleClick}
              className="normal-case min-w-0 max-w-full break-words typography-micro text-[var(--status-info)] hover:underline"
            >
              {t("supervision.missionControl.action.compare")}
            </button>
          ) : null}
          <Button
            size="sm"
            className="normal-case min-w-0 max-w-full min-h-8 h-auto whitespace-normal px-3 py-1 typography-meta"
            onClick={handlePrimaryClick}
            onDoubleClick={handleActionDoubleClick}
            aria-label={`${primaryLabel} — ${actionContext}`}
          >
            {primaryLabel}
          </Button>
          <Button
            size="sm"
            variant="ghost"
            className="normal-case h-8 w-8 shrink-0 p-0"
            aria-label={`${t("supervision.missionControl.action.details")} — ${actionContext}`}
            title={t("supervision.missionControl.action.details")}
            aria-expanded={expanded}
            aria-controls={expanded ? `mission-details-${row.sessionId}` : undefined}
            onClick={(event) => {
              event.stopPropagation()
              onToggleDetails(row.sessionId)
            }}
            onDoubleClick={handleActionDoubleClick}
          >
            <Icon name={expanded ? "arrow-up-s" : "arrow-down-s"} className="h-3.5 w-3.5" aria-hidden="true" />
          </Button>
          {activeWorkingSetId ? (
            <button
              type="button"
              aria-label={`${t("supervision.missionControl.action.removeFromSet")} — ${actionContext}`}
              title={t("supervision.missionControl.action.removeFromSet")}
              onClick={handleRemoveClick}
              onDoubleClick={handleActionDoubleClick}
              className="normal-case shrink-0 rounded p-1 text-muted-foreground hover:text-destructive"
            >
              <Icon name="close" className="h-3.5 w-3.5" aria-hidden="true" />
            </button>
          ) : null}
        </span>
      </div>
      {expanded ? (
        <div id={`mission-details-${row.sessionId}`} role="row">
          <div role="gridcell">{children}</div>
        </div>
      ) : null}
    </div>
  )
}
