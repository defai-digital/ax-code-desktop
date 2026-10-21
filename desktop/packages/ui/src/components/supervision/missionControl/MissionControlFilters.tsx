import React from "react"
import type { RefObject } from "react"
import { Button } from "@/components/ui/button"
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuCheckboxItem,
} from "@/components/ui/dropdown-menu"
import { Icon } from "@/components/icon/Icon"
import { useI18n } from "@/lib/i18n"
import { matchesMissionStatus, type MissionStatusFilter } from "@/lib/supervision/missionControl"
import type { SupervisionState } from "@/lib/supervision/sessionState"
import { cn } from "@/lib/utils"

interface Props {
  searchRef: RefObject<HTMLInputElement | null>
  query: string
  onQueryChange: (query: string) => void
  status: MissionStatusFilter
  onStatusChange: (status: MissionStatusFilter) => void
  projects: readonly { key: string; label: string; count: number }[]
  selectedProjects: readonly { key: string; label: string }[]
  onProjectsChange: (keys: string[]) => void
  hasChanges: boolean
  onHasChangesChange: (value: boolean) => void
  checksFailing: boolean
  onChecksFailingChange: (value: boolean) => void
  updatedOnly: boolean
  onUpdatedOnlyChange: (value: boolean) => void
  /** Sessions in scope updated since the user last viewed them. */
  updatedCount: number
  rows: readonly { state: SupervisionState }[]
  shown: number
  total: number
  hiddenNeedsYou: number
  onShowNeedsYou: () => void
  onReset: () => void
}

const statuses = [
  ["all", "supervision.missionControl.filter.all"],
  ["attention", "supervision.missionControl.filter.attention"],
  ["running", "supervision.missionControl.state.running"],
  ["review", "supervision.state.review"],
] as const

export function MissionControlFilters(props: Props) {
  const { t } = useI18n()
  const projectTriggerRef = React.useRef<HTMLButtonElement>(null)
  // A removed chip unmounts the focused button; keep keyboard users on the filter bar instead of the page body.
  const keepFocus = () => requestAnimationFrame(() => projectTriggerRef.current?.focus({ preventScroll: true }))
  const projectKeys = props.selectedProjects.map((project) => project.key)
  const activeStatus = statuses.find(([value]) => value === props.status)!
  return (
    <div className="shrink-0 space-y-2 border-b border-border/50 px-4 py-3" data-mission-filters>
      <div className="flex min-w-0 flex-wrap items-center gap-3">
        <div className="flex min-w-0 flex-[1_1_16rem] items-center gap-2 rounded-md border border-border bg-background px-3 focus-within:ring-2 focus-within:ring-ring">
          <Icon name="search" className="h-4 w-4 shrink-0 text-muted-foreground" aria-hidden="true" />
          <input
            ref={props.searchRef}
            type="search"
            value={props.query}
            onChange={(event) => props.onQueryChange(event.target.value)}
            placeholder={t("supervision.missionControl.search")}
            aria-label={t("supervision.missionControl.search")}
            className="h-9 min-w-0 flex-1 bg-transparent typography-meta outline-none"
          />
        </div>
        <DropdownMenu>
          <DropdownMenuTrigger asChild data-mission-project-filter>
            <Button ref={projectTriggerRef} variant="outline" size="sm" className="normal-case min-h-9">
              {t("supervision.missionControl.filter.projects")}
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent
            align="start"
            className="max-h-80 overflow-y-auto"
            data-mission-project-filter
            aria-label={t("supervision.missionControl.filter.projects")}
          >
            {props.projects.map((project) => (
              <DropdownMenuCheckboxItem
                key={project.key}
                checked={projectKeys.includes(project.key)}
                closeOnClick={false}
                onCheckedChange={(checked) =>
                  props.onProjectsChange(
                    checked ? [...projectKeys, project.key] : projectKeys.filter((key) => key !== project.key),
                  )
                }
                aria-label={`${project.label} (${project.count})`}
                className="normal-case min-h-9 gap-3 pr-8"
              >
                <span className="max-w-64 truncate" title={project.label}>
                  {project.label}
                </span>
                <span className="ml-auto tabular-nums text-muted-foreground">{project.count}</span>
              </DropdownMenuCheckboxItem>
            ))}
          </DropdownMenuContent>
        </DropdownMenu>
        <Button
          variant="outline"
          size="sm"
          className={cn(
            "normal-case min-h-9",
            props.hasChanges && "border-primary/40 bg-interactive-selection text-primary",
          )}
          aria-pressed={props.hasChanges}
          onClick={() => props.onHasChangesChange(!props.hasChanges)}
        >
          {t("supervision.missionControl.filter.hasChanges")}
        </Button>
        <Button
          variant="outline"
          size="sm"
          className={cn(
            "normal-case min-h-9",
            props.checksFailing && "border-primary/40 bg-interactive-selection text-primary",
          )}
          aria-pressed={props.checksFailing}
          onClick={() => props.onChecksFailingChange(!props.checksFailing)}
        >
          {t("supervision.missionControl.filter.checksFailing")}
        </Button>
        <Button
          variant="outline"
          size="sm"
          className={cn(
            "normal-case min-h-9 gap-2",
            props.updatedOnly && "border-primary/40 bg-interactive-selection text-primary",
          )}
          aria-pressed={props.updatedOnly}
          aria-label={`${t("supervision.missionControl.filter.updated")} (${props.updatedCount})`}
          onClick={() => props.onUpdatedOnlyChange(!props.updatedOnly)}
        >
          {t("supervision.missionControl.filter.updated")}
          <span className="tabular-nums">{props.updatedCount}</span>
        </Button>
        <div role="group" aria-label={t("supervision.missionControl.filter.status")} className="flex flex-wrap gap-1">
          {statuses.map(([value, label]) => (
            <button
              key={value}
              type="button"
              aria-label={`${t(label)} (${props.rows.filter((row) => matchesMissionStatus(row.state, value)).length})`}
              aria-pressed={props.status === value}
              data-mission-status={value}
              onClick={() => props.onStatusChange(value)}
              className={cn(
                "normal-case inline-flex min-h-9 items-center gap-2 rounded-md border px-3 py-1 typography-meta focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                props.status === value
                  ? "border-primary/40 bg-interactive-selection text-primary"
                  : "border-border/50 text-muted-foreground hover:bg-interactive-hover hover:text-foreground",
              )}
            >
              {t(label)}
              <span className="tabular-nums">
                {props.rows.filter((row) => matchesMissionStatus(row.state, value)).length}
              </span>
            </button>
          ))}
        </div>
      </div>
      <div className="flex flex-wrap items-center gap-2">
        {props.status !== "all" ? (
          <Button
            variant="outline"
            size="sm"
            className="normal-case h-auto min-h-7"
            aria-label={t("supervision.missionControl.filter.remove", {
              name: t(activeStatus[1]),
            })}
            onClick={() => {
              props.onStatusChange("all")
              keepFocus()
            }}
          >
            {t(activeStatus[1])} <span aria-hidden="true">×</span>
          </Button>
        ) : null}
        {props.selectedProjects.map(({ key, label }) => {
          return (
            <Button
              key={key}
              variant="outline"
              size="sm"
              className="normal-case h-auto min-h-7 max-w-full"
              aria-label={t("supervision.missionControl.filter.remove", { name: label })}
              onClick={() => {
                props.onProjectsChange(projectKeys.filter((value) => value !== key))
                keepFocus()
              }}
            >
              <span className="truncate">{label}</span> <span aria-hidden="true">×</span>
            </Button>
          )
        })}
        {props.query ||
        props.status !== "all" ||
        projectKeys.length > 0 ||
        props.hasChanges ||
        props.checksFailing ||
        props.updatedOnly ? (
          <Button
            variant="ghost"
            size="sm"
            className="normal-case h-auto min-h-7"
            onClick={() => {
              props.onReset()
              keepFocus()
            }}
          >
            {t("supervision.missionControl.filter.clearAll")}
          </Button>
        ) : null}
      </div>
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1 typography-micro text-muted-foreground">
        <span role="status">{t("supervision.missionControl.results", { shown: props.shown, total: props.total })}</span>
        {props.hiddenNeedsYou > 0 ? (
          <button
            type="button"
            onClick={props.onShowNeedsYou}
            className="min-h-7 rounded px-1 text-[var(--status-warning)] hover:underline focus-visible:ring-2 focus-visible:ring-ring"
          >
            {t("supervision.missionControl.hiddenNeedsYou", { count: props.hiddenNeedsYou })}
          </button>
        ) : null}
      </div>
    </div>
  )
}
