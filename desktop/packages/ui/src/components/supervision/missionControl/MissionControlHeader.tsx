import React from "react"

import { Icon } from "@/components/icon/Icon"
import { Button } from "@/components/ui/button"
import { useI18n } from "@/lib/i18n"
import { HIGH_TOUCH_SOFT_LIMIT } from "@/lib/supervision/sessionState"
import { cn } from "@/lib/utils"
import type { WorkingSet } from "@/stores/useSupervisionStore"

export interface MissionControlHeaderProps {
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
  onDispatch: () => void
  onClose: () => void
}

export const MissionControlHeader: React.FC<MissionControlHeaderProps> = ({
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
    <div className="flex h-12 shrink-0 items-center gap-3 border-b border-border px-4">
      <span className="shrink-0 typography-ui-label font-semibold text-foreground">
        {t("supervision.missionControl.title")}
      </span>
      <span className="shrink-0 typography-micro text-muted-foreground">
        {t("supervision.missionControl.wipSummary", { needsYou: wip.needsYou, running: wip.running })}
      </span>
      {wip.overSoftLimit ? (
        <span className="shrink-0 rounded-full border border-[var(--status-warning)]/40 px-2 py-0.5 typography-micro text-[var(--status-warning)]">
          {t("supervision.missionControl.overLimit", { limit: HIGH_TOUCH_SOFT_LIMIT })}
        </span>
      ) : null}
      <div className="ml-auto flex min-w-0 items-center gap-2">
        <Button size="sm" onClick={onDispatch}>
          {t("supervision.dispatch.title")}
        </Button>
        <div
          className="flex min-w-0 items-center gap-0.5 overflow-x-auto rounded-md border border-border p-0.5"
          role="tablist"
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
                role="tab"
                aria-selected={isSelected}
                onClick={handleClick}
                className={cn(
                  "shrink-0 rounded px-2 py-1 typography-micro",
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
                role="tab"
                aria-selected={isSelected}
                onClick={handleClick}
                className={cn(
                  "max-w-32 shrink-0 truncate rounded px-2 py-1 typography-micro",
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
              <Button size="sm" className="h-6 px-2 typography-micro" onClick={onSubmitCreate}>
                {t("supervision.missionControl.createWorkingSet")}
              </Button>
            </span>
          ) : (
            <button
              type="button"
              aria-label={t("supervision.missionControl.newWorkingSet")}
              title={t("supervision.missionControl.newWorkingSet")}
              onClick={onStartCreate}
              className="shrink-0 rounded px-1.5 py-1 typography-micro text-muted-foreground hover:text-foreground"
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
              className="rounded p-1 text-muted-foreground hover:text-foreground"
            >
              <Icon name="edit-2" className="h-3.5 w-3.5" aria-hidden="true" />
            </button>
            <button
              type="button"
              aria-label={t("supervision.missionControl.deleteWorkingSet")}
              title={t("supervision.missionControl.deleteWorkingSet")}
              onClick={handleDeleteClick}
              className="rounded p-1 text-muted-foreground hover:text-destructive"
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
            <Button size="sm" className="h-6 px-2 typography-micro" onClick={onSubmitRename}>
              {t("common.confirm")}
            </Button>
            <Button size="sm" variant="ghost" className="h-6 px-2 typography-micro" onClick={onCancelRename}>
              {t("common.cancel")}
            </Button>
          </span>
        ) : null}
        <span className="hidden shrink-0 typography-micro text-muted-foreground lg:inline">{shortcutHint}</span>
        <button
          type="button"
          aria-label={t("supervision.missionControl.closeAria")}
          title={`${t("supervision.missionControl.closeAria")} (${shortcutHint})`}
          onClick={onClose}
          className="shrink-0 rounded p-1.5 text-muted-foreground hover:text-foreground"
        >
          <Icon name="close" className="h-4 w-4" aria-hidden="true" />
        </button>
      </div>
    </div>
  )
}
