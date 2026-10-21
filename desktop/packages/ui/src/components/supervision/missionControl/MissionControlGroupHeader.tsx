import React from "react"
import { Icon } from "@/components/icon/Icon"
import { Button } from "@/components/ui/button"
import { useI18n } from "@/lib/i18n"
import { useFormatEvidence } from "../EvidenceText"
import type { MissionGroup } from "@/lib/supervision/missionGroups"
import { formatPathForDisplay } from "@/lib/utils"
import { useDirectoryStore } from "@/stores/useDirectoryStore"
import { useProjectsStore } from "@/stores/useProjectsStore"

interface MissionControlGroupHeaderProps {
  group: MissionGroup
  label: string
  collapsed: boolean
  onToggle: () => void
  selectedCount: number
  onToggleSelection: () => void
}

export function MissionControlGroupHeader({
  group,
  label,
  collapsed,
  onToggle,
  selectedCount,
  onToggleSelection,
}: MissionControlGroupHeaderProps) {
  const { t } = useI18n()
  const checkboxRef = React.useRef<HTMLInputElement>(null)
  const checked = !collapsed && group.rows.length > 0 && selectedCount === group.rows.length
  const mixed = !collapsed && selectedCount > 0 && !checked
  React.useEffect(() => {
    if (checkboxRef.current) checkboxRef.current.indeterminate = mixed
  }, [mixed])
  const homeDirectory = useDirectoryStore((s) => s.homeDirectory)
  const formatEvidence = useFormatEvidence()
  // The registry label reads better as a heading; `label` may carry a disambiguating path that the
  // path line below already shows. `label` stays the accessible name so same-name projects remain distinct.
  const project = useProjectsStore((s) => s.projects.find((p) => p.id === group.key) ?? null)
  const projectName = project?.label?.trim() || null
  // A registered project is named by its root; the first row's directory may be a subdirectory or worktree.
  const groupPath = project?.path ?? group.directory
  const shortPath = groupPath ? formatPathForDisplay(groupPath, homeDirectory) : null
  const title = projectName ?? label
  return (
    <div role="row" className="mission-group-header border-b border-border/50 bg-sidebar/30 px-4 py-2">
      <div role="gridcell" className="flex min-w-0 items-center gap-2">
        <input
          ref={checkboxRef}
          type="checkbox"
          className="mission-selection-checkbox"
          aria-label={t("supervision.missionControl.bulk.selectProject", { project: label })}
          aria-checked={mixed ? "mixed" : checked}
          checked={checked}
          disabled={collapsed}
          onChange={onToggleSelection}
        />
        <Button
          size="icon"
          variant="ghost"
          className="h-7 w-7 shrink-0 normal-case"
          aria-expanded={!collapsed}
          aria-label={t(
            collapsed ? "supervision.missionControl.expandProject" : "supervision.missionControl.collapseProject",
            { project: label },
          )}
          onClick={onToggle}
        >
          <Icon name={collapsed ? "arrow-right-s" : "arrow-down-s"} className="h-4 w-4" aria-hidden="true" />
        </Button>
        <div className="flex min-w-0 flex-1 flex-col">
          <div className="flex min-w-0 flex-wrap items-baseline gap-x-3">
            <span
              className="min-w-0 truncate typography-ui-label font-medium text-foreground"
              title={groupPath ?? undefined}
            >
              {title}
            </span>
            <span className="shrink-0 typography-micro text-muted-foreground">
              {t("supervision.missionControl.wipSummary", { needsYou: group.needsYou, running: group.running })}
            </span>
          </div>
          {shortPath && shortPath !== title ? (
            <span
              className="min-w-0 truncate typography-micro text-muted-foreground"
              style={{ direction: "rtl", textAlign: "left", unicodeBidi: "plaintext" }}
              title={groupPath ?? undefined}
            >
              {shortPath}
            </span>
          ) : null}
        </div>
        {group.evidence ? (
          <span className="shrink-0 whitespace-nowrap typography-micro">
            <span className="sr-only">{formatEvidence(group.evidence)}</span>
            <span aria-hidden="true">
              <span className="text-[var(--status-success)]">+{group.evidence.additions}</span>{" "}
              <span className="text-[var(--status-error)]">−{group.evidence.deletions}</span>
            </span>
          </span>
        ) : null}
      </div>
    </div>
  )
}
