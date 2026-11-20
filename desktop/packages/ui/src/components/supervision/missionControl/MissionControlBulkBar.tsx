import React from "react"

import { Button } from "@/components/ui/button"
import { useI18n } from "@/lib/i18n"
import type { WorkingSet } from "@/stores/useSupervisionStore"

interface MissionControlBulkBarProps {
  count: number
  runningCount: number
  busy: boolean
  workingSets: readonly WorkingSet[]
  onAddToWorkingSet: (id: string) => void
  onCreateWorkingSet: (name: string) => void
  onStop: () => void
  onArchive: () => void
  onClear: () => void
}

export function MissionControlBulkBar({
  count,
  runningCount,
  busy,
  workingSets,
  onAddToWorkingSet,
  onCreateWorkingSet,
  onStop,
  onArchive,
  onClear,
}: MissionControlBulkBarProps) {
  const { t } = useI18n()
  const [creating, setCreating] = React.useState(false)
  const [name, setName] = React.useState("")
  const submit = () => {
    if (busy || !name.trim()) return
    onCreateWorkingSet(name.trim())
    setCreating(false)
    setName("")
  }

  return (
    <div
      role="toolbar"
      aria-label={t("supervision.missionControl.bulk.label")}
      aria-busy={busy}
      className="mission-bulk-bar"
    >
      <span className="typography-ui-label">
        {t("supervision.missionControl.bulk.selected", { count })}
      </span>
      <select
        aria-label={t("supervision.missionControl.action.addToWorkingSet")}
        value=""
        disabled={busy}
        className="normal-case h-8 min-w-0 max-w-full rounded border border-border bg-background px-2 typography-meta"
        onChange={(event) => {
          if (event.target.value === "__new__") {
            setName("")
            setCreating(true)
          } else if (event.target.value) {
            onAddToWorkingSet(event.target.value)
          }
        }}
      >
        <option value="">{t("supervision.missionControl.action.addToWorkingSet")}</option>
        {workingSets.map((set) => (
          <option key={set.id} value={set.id}>
            {set.name}
          </option>
        ))}
        <option value="__new__">{t("supervision.missionControl.action.newWorkingSetOption")}</option>
      </select>
      {creating ? (
        <span className="flex min-w-0 max-w-full flex-wrap items-center gap-1">
          <input
            autoFocus
            value={name}
            disabled={busy}
            aria-label={t("supervision.missionControl.workingSetNamePlaceholder")}
            placeholder={t("supervision.missionControl.workingSetNamePlaceholder")}
            className="h-8 w-32 min-w-0 max-w-full rounded border border-border bg-background px-2 typography-meta"
            onChange={(event) => setName(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "Enter") {
                event.preventDefault()
                submit()
              }
            }}
          />
          <Button size="sm" className="normal-case" disabled={busy || !name.trim()} onClick={submit}>
            {t("supervision.missionControl.createWorkingSet")}
          </Button>
          <Button size="sm" variant="ghost" className="normal-case" disabled={busy} onClick={() => setCreating(false)}>
            {t("common.cancel")}
          </Button>
        </span>
      ) : null}
      <Button
        size="sm"
        variant="outline"
        className="normal-case"
        disabled={busy || runningCount === 0}
        onClick={onStop}
      >
        {t("supervision.missionControl.bulk.stop", { count: runningCount })}
      </Button>
      <Button size="sm" variant="destructive" className="normal-case" disabled={busy} onClick={onArchive}>
        {t("supervision.missionControl.bulk.archive")}
      </Button>
      <Button size="sm" variant="ghost" className="normal-case" onClick={onClear}>
        {t("supervision.missionControl.bulk.clear")}
      </Button>
    </div>
  )
}
