import React from "react"

import { Icon } from "@/components/icon/Icon"
import { Button } from "@/components/ui/button"
import type { SupervisionRow as SupervisionRowData } from "@/hooks/useSupervisionRows"
import { useI18n } from "@/lib/i18n"
import { parseMultiRunSessionTitle } from "@/lib/multirun/title"
import { multiRunGroupKeyFromParsed } from "@/lib/supervision/multiRunGroups"
import { formatRelativeAge } from "@/lib/supervision/relativeAge"
import type { SupervisionState } from "@/lib/supervision/sessionState"
import { cn } from "@/lib/utils"
import { EvidenceText } from "../EvidenceText"

const STATE_META: Record<
  SupervisionState,
  { icon: "shield-warning" | "question" | "error-warning" | "file-check" | null; className: string }
> = {
  permission: { icon: "shield-warning", className: "text-[var(--status-warning)] border-[var(--status-warning)]/40" },
  question: { icon: "question", className: "text-[var(--status-warning)] border-[var(--status-warning)]/40" },
  error: { icon: "error-warning", className: "text-destructive border-destructive/40" },
  review: { icon: "file-check", className: "text-[var(--status-info)] border-[var(--status-info)]/40" },
  running: { icon: null, className: "text-foreground border-border" },
  idle: { icon: null, className: "text-muted-foreground border-border" },
}

export interface MissionControlRowProps {
  row: SupervisionRowData
  selected: boolean
  expanded: boolean
  activeWorkingSetId: string | null
  primaryLabel: string
  onSelect: (sessionId: string) => void
  onOpen: (row: SupervisionRowData) => void
  onPrimary: (row: SupervisionRowData) => void
  onCompare: (groupKey: string) => void
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
  const meta = STATE_META[row.state]
  const groupSlug = multiRunGroupKeyFromParsed(parseMultiRunSessionTitle(row.title))

  const handleSelectClick = (event: React.MouseEvent<HTMLDivElement>) => {
    onSelect(row.sessionId)
    // The board (role="grid") owns keyboard navigation via aria-activedescendant;
    // move DOM focus there so j/k and arrow keys continue from this row.
    event.currentTarget.closest<HTMLElement>('[role="grid"]')?.focus({ preventScroll: true })
  }

  const handleDoubleClick = () => {
    onOpen(row)
  }

  const handleCompareClick = (event: React.MouseEvent) => {
    event.stopPropagation()
    if (groupSlug) {
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
        className={cn("flex cursor-pointer items-center gap-3 px-4 py-2", selected && "bg-interactive-hover/50")}
      >
        <span
          className={cn(
            "flex w-28 shrink-0 items-center gap-1.5 rounded-full border px-2 py-0.5 typography-micro",
            meta.className,
          )}
        >
          {row.state === "running" ? (
            <span className="h-1.5 w-1.5 shrink-0 animate-pulse rounded-full bg-[var(--status-success)]" />
          ) : row.state === "idle" ? (
            <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-muted-foreground/50" />
          ) : meta.icon ? (
            <Icon name={meta.icon} className="h-3 w-3 shrink-0" aria-hidden="true" />
          ) : null}
          <span className="truncate">
            {t(`supervision.missionControl.state.${row.state}` as Parameters<typeof t>[0])}
          </span>
        </span>
        <span className="min-w-0 flex-1 truncate typography-ui-label text-foreground" title={row.title}>
          {row.title}
        </span>
        {groupSlug ? (
          <button
            type="button"
            onClick={handleCompareClick}
            className="shrink-0 typography-micro text-[var(--status-info)] hover:underline"
          >
            {t("supervision.missionControl.action.compare")}
          </button>
        ) : null}
        <span className="hidden w-36 shrink-0 truncate typography-micro text-muted-foreground sm:block">
          {row.projectLabel ?? "\u2014"}
        </span>
        <EvidenceText
          evidence={row.evidence}
          className="w-32 shrink-0 truncate typography-micro text-muted-foreground"
        />
        <span className="w-16 shrink-0 text-right typography-micro text-muted-foreground">
          {row.updatedAt ? formatRelativeAge(Date.now() - row.updatedAt, t) : "\u2014"}
        </span>
        <Button
          size="sm"
          className="h-6 shrink-0 px-2 typography-micro"
          onClick={handlePrimaryClick}
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
            className="shrink-0 rounded p-1 text-muted-foreground hover:text-destructive"
          >
            <Icon name="close" className="h-3.5 w-3.5" aria-hidden="true" />
          </button>
        ) : null}
      </div>
      {expanded ? children : null}
    </div>
  )
}
