import React from "react"

import { Icon } from "@/components/icon/Icon"
import { Button } from "@/components/ui/button"
import { useI18n } from "@/lib/i18n"
import { HIGH_TOUCH_SOFT_LIMIT } from "@/lib/supervision/sessionState"
import { cn } from "@/lib/utils"
import type { BoardGroupBy, SupervisionDensity, WorkingSet } from "@/stores/useSupervisionStore"

export interface MissionControlHeaderProps {
  boardGroupBy: BoardGroupBy
  onGroupByChange: (groupBy: BoardGroupBy) => void
  density: SupervisionDensity
  onDensityChange: (density: SupervisionDensity) => void
  wip: { needsYou: number; running: number; overSoftLimit: boolean }
  mode: "live" | "recent"
  workingSets: readonly WorkingSet[]
  activeWorkingSetId: string | null
  activeSet: WorkingSet | null
  creating: boolean
  newSetName: string
  renaming: boolean
  renameValue: string
  shortcutHint: string
  onSelectMode: (mode: "live" | "recent") => void
  onSelectWorkingSet: (id: string) => void
  onStartCreate: () => void
  onNewSetNameChange: (value: string) => void
  onSubmitCreate: () => void
  onCancelCreate: () => void
  onStartRename: () => void
  onRenameValueChange: (value: string) => void
  onSubmitRename: () => void
  onCancelRename: () => void
  onDeleteWorkingSet: () => void
  /** Quick dispatch; omitted in the pop-out window, which does not host the dispatch dialog. */
  onDispatch?: () => void
  /** Leaves the board; omitted in the pop-out window, which the user closes like any window. */
  onClose?: () => void
  /** Opens the board in its own window; only offered by the embedded board in the Electron shell. */
  onPopOut?: () => void
}

export const MissionControlHeader: React.FC<MissionControlHeaderProps> = ({
  boardGroupBy,
  onGroupByChange,
  density,
  onDensityChange,
  wip,
  mode,
  workingSets,
  activeWorkingSetId,
  activeSet,
  creating,
  newSetName,
  renaming,
  renameValue,
  shortcutHint,
  onSelectMode,
  onSelectWorkingSet,
  onStartCreate,
  onNewSetNameChange,
  onSubmitCreate,
  onCancelCreate,
  onStartRename,
  onRenameValueChange,
  onSubmitRename,
  onCancelRename,
  onDeleteWorkingSet,
  onDispatch,
  onClose,
  onPopOut,
}) => {
  const { t } = useI18n()

  const handleCreateKeyDown = (event: React.KeyboardEvent<HTMLInputElement>) => {
    if (event.key === "Enter") {
      onSubmitCreate()
    }
    if (event.key === "Escape") {
      event.stopPropagation()
      onCancelCreate()
    }
  }

  const handleRenameKeyDown = (event: React.KeyboardEvent<HTMLInputElement>) => {
    if (event.key === "Enter") {
      onSubmitRename()
    }
    if (event.key === "Escape") {
      event.stopPropagation()
      onCancelRename()
    }
  }

  const handleDeleteClick = () => {
    onDeleteWorkingSet()
  }

  return (
    <header className="shrink-0 border-b border-border bg-sidebar/30">
      <div className="flex min-h-16 flex-wrap items-center gap-3 px-4 py-3">
        <h1 className="shrink-0 text-base font-semibold text-foreground">{t("supervision.missionControl.title")}</h1>
        <span className="shrink-0 typography-micro text-muted-foreground">
          {t("supervision.missionControl.wipSummary", { needsYou: wip.needsYou, running: wip.running })}
        </span>
        {wip.overSoftLimit ? (
          <span className="normal-case shrink-0 rounded-full border border-[var(--status-warning)]/40 px-2 py-0.5 typography-micro text-[var(--status-warning)]">
            {t("supervision.missionControl.overLimit", { limit: HIGH_TOUCH_SOFT_LIMIT })}
          </span>
        ) : null}
        <div className="ml-auto flex shrink-0 items-center gap-2">
          {onDispatch ? (
            <Button size="sm" className="normal-case" onClick={onDispatch}>
              <Icon name="send-plane" className="h-3.5 w-3.5" aria-hidden="true" />
              {t("supervision.dispatch.title")}
            </Button>
          ) : null}
          {onPopOut ? (
            <button
              type="button"
              aria-label={t("supervision.missionControl.popOut")}
              title={t("supervision.missionControl.popOut")}
              onClick={onPopOut}
              data-mission-control-popout=""
              className="normal-case shrink-0 rounded p-1.5 text-muted-foreground hover:text-foreground"
            >
              <Icon name="window" className="h-4 w-4" aria-hidden="true" />
            </button>
          ) : null}
          {onClose ? (
            <>
              <span
                className="mission-shortcut flex shrink-0 items-center gap-1 typography-micro text-muted-foreground"
                aria-label={shortcutHint}
              >
                {shortcutHint.split(" + ").map((key, index) => (
                  <kbd key={index} className="rounded border border-border px-1 py-0.5 font-sans">
                    {key}
                  </kbd>
                ))}
              </span>
              <button
                type="button"
                aria-label={t("supervision.missionControl.closeAria")}
                title={`${t("supervision.missionControl.closeAria")} (${shortcutHint})`}
                onClick={onClose}
                className="normal-case shrink-0 rounded p-1.5 text-muted-foreground hover:text-foreground"
              >
                <Icon name="close" className="h-4 w-4" aria-hidden="true" />
              </button>
            </>
          ) : null}
        </div>
      </div>
      <div className="flex min-w-0 flex-wrap items-center gap-3 border-t border-border/40 px-4 py-2">
        <div
          className="flex min-w-0 items-center gap-0.5 overflow-x-auto rounded-md border border-border p-0.5"
          role="group"
          aria-label={t("supervision.missionControl.filterLabel")}
        >
          {(["live", "recent"] as const).map((filterMode) => {
            const isSelected = !activeWorkingSetId && mode === filterMode
            const handleClick = () => {
              onSelectMode(filterMode)
            }
            return (
              <button
                key={filterMode}
                type="button"
                aria-pressed={isSelected}
                onClick={handleClick}
                className={cn(
                  "normal-case shrink-0 rounded px-2 py-1 typography-micro",
                  isSelected ? "bg-interactive-hover text-foreground" : "text-muted-foreground hover:text-foreground",
                )}
              >
                {t(
                  filterMode === "live"
                    ? "supervision.missionControl.filter.live"
                    : "supervision.missionControl.filter.recent",
                )}
              </button>
            )
          })}
          {workingSets.map((workingSet) => {
            const isSelected = activeWorkingSetId === workingSet.id
            const handleClick = () => {
              onSelectWorkingSet(workingSet.id)
            }
            return (
              <button
                key={workingSet.id}
                type="button"
                aria-pressed={isSelected}
                onClick={handleClick}
                className={cn(
                  "normal-case max-w-32 shrink-0 truncate rounded px-2 py-1 typography-micro",
                  isSelected ? "bg-interactive-hover text-foreground" : "text-muted-foreground hover:text-foreground",
                )}
              >
                {workingSet.name}
              </button>
            )
          })}
          {creating ? (
            <span className="flex shrink-0 items-center gap-1">
              <input
                autoFocus
                value={newSetName}
                onChange={(event) => onNewSetNameChange(event.target.value)}
                onKeyDown={handleCreateKeyDown}
                placeholder={t("supervision.missionControl.workingSetNamePlaceholder")}
                aria-label={t("supervision.missionControl.workingSetNamePlaceholder")}
                className="h-6 w-32 rounded border border-border bg-background px-1.5 typography-micro text-foreground outline-none"
              />
              <Button size="sm" className="normal-case h-6 px-2 typography-micro" onClick={onSubmitCreate}>
                {t("supervision.missionControl.createWorkingSet")}
              </Button>
            </span>
          ) : (
            <button
              type="button"
              aria-label={t("supervision.missionControl.newWorkingSet")}
              title={t("supervision.missionControl.newWorkingSet")}
              onClick={onStartCreate}
              className="normal-case shrink-0 rounded px-1.5 py-1 typography-micro text-muted-foreground hover:text-foreground"
            >
              +
            </button>
          )}
        </div>
        {activeSet && !renaming ? (
          <span className="flex shrink-0 items-center gap-0.5">
            <button
              type="button"
              aria-label={t("supervision.missionControl.renameWorkingSet")}
              title={t("supervision.missionControl.renameWorkingSet")}
              onClick={onStartRename}
              className="normal-case rounded p-1 text-muted-foreground hover:text-foreground"
            >
              <Icon name="edit-2" className="h-3.5 w-3.5" aria-hidden="true" />
            </button>
            <button
              type="button"
              aria-label={t("supervision.missionControl.deleteWorkingSet")}
              title={t("supervision.missionControl.deleteWorkingSet")}
              onClick={handleDeleteClick}
              className="normal-case rounded p-1 text-muted-foreground hover:text-destructive"
            >
              <Icon name="delete-bin" className="h-3.5 w-3.5" aria-hidden="true" />
            </button>
          </span>
        ) : null}
        {renaming && activeSet ? (
          <span className="flex shrink-0 items-center gap-1">
            <input
              autoFocus
              value={renameValue}
              onChange={(event) => onRenameValueChange(event.target.value)}
              onKeyDown={handleRenameKeyDown}
              aria-label={t("supervision.missionControl.renameWorkingSet")}
              className="h-6 w-32 rounded border border-border bg-background px-1.5 typography-micro text-foreground outline-none"
            />
            <Button size="sm" className="normal-case h-6 px-2 typography-micro" onClick={onSubmitRename}>
              {t("common.confirm")}
            </Button>
            <Button
              size="sm"
              variant="ghost"
              className="normal-case h-6 px-2 typography-micro"
              onClick={onCancelRename}
            >
              {t("common.cancel")}
            </Button>
          </span>
        ) : null}
        <div className="ml-auto flex min-w-0 max-w-full flex-wrap items-center justify-end gap-2">
          <div
            role="group"
            aria-label={t("supervision.missionControl.density")}
            className="flex rounded-md border border-border p-0.5"
          >
            {(["comfortable", "compact"] as const).map((value) => (
              <button
                key={value}
                type="button"
                aria-pressed={density === value}
                aria-label={t(
                  value === "comfortable"
                    ? "supervision.missionControl.comfortable"
                    : "supervision.missionControl.compact",
                )}
                onClick={() => onDensityChange(value)}
                className={cn(
                  "normal-case rounded px-2 py-1 typography-micro",
                  density === value
                    ? "bg-interactive-hover text-foreground"
                    : "text-muted-foreground hover:text-foreground",
                )}
              >
                {t(
                  value === "comfortable"
                    ? "supervision.missionControl.comfortable"
                    : "supervision.missionControl.compact",
                )}
              </button>
            ))}
          </div>
          <button
            type="button"
            aria-pressed={boardGroupBy === "project"}
            onClick={() => onGroupByChange(boardGroupBy === "project" ? "none" : "project")}
            className={cn(
              "inline-flex max-w-full items-center gap-1.5 rounded-md border px-2 py-1 typography-micro focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
              boardGroupBy === "project"
                ? "border-primary/40 bg-interactive-selection text-primary"
                : "border-border text-muted-foreground hover:text-foreground",
            )}
          >
            <Icon name="folder" className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
            <span className="min-w-0 truncate">{t("supervision.missionControl.groupByProject")}</span>
          </button>
        </div>
      </div>
    </header>
  )
}
