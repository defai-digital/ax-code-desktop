import React from "react"
import { useI18n } from "@/lib/i18n"
import type { ScheduledTaskDraft } from "./ScheduledTaskEditorDialog"
import { formatWeekday } from "./scheduledTaskFormat"
import { normalizeScheduledTaskTimes } from "./scheduledTaskTime"

interface ScheduledTaskConfirmationProps {
  schedule: ScheduledTaskDraft["schedule"]
  enabled: boolean
  catchUpPolicy: ScheduledTaskDraft["catchUpPolicy"]
  /** Untouched irregular schedules must describe the canonical family, not the editor's daily fallback. */
  originalDescription?: string
}

/** Confirms wall-clock intent; only the runtime can confirm the actual next execution. */
export function ScheduledTaskConfirmation(props: ScheduledTaskConfirmationProps): React.ReactNode {
  const { t } = useI18n()
  const { schedule } = props
  let description = props.originalDescription
  if (!description) {
    const time = normalizeScheduledTaskTimes(schedule.times).join(", ")
    if (schedule.kind === "once") {
      description = `${t("sessions.scheduledTasks.dialog.schedule.once", { date: schedule.onceDate, time: schedule.onceTime })} · ${schedule.timezone}`
    } else if (!time) {
      description = t("sessions.scheduledTasks.editor.validation.atLeastOneTime")
    } else if (schedule.kind === "weekly") {
      description =
        schedule.weekdays.length === 0
          ? t("sessions.scheduledTasks.editor.validation.atLeastOneWeekday")
          : t("sessions.scheduledTasks.dialog.schedule.weeklyWithTimezone", {
              days: Array.from(new Set(schedule.weekdays))
                .sort()
                .map((day) => formatWeekday(day, t))
                .join(", "),
              time,
              timezone: schedule.timezone,
            })
    } else {
      description = t("sessions.scheduledTasks.dialog.schedule.dailyWithTimezone", {
        time,
        timezone: schedule.timezone,
      })
    }
  }
  return (
    <section className="space-y-1 rounded-md border border-border/60 bg-muted/30 px-3 py-2" data-scheduled-confirmation>
      <h3 className="typography-meta font-medium text-foreground">
        {t("sessions.scheduledTasks.editor.confirmation.title")}
      </h3>
      <p className="break-words typography-meta text-foreground" aria-live="polite">
        {description}
      </p>
      {!props.enabled ? (
        <p className="typography-micro text-status-warning">{t("sessions.scheduledTasks.editor.confirmation.off")}</p>
      ) : null}
      <p className="typography-micro text-muted-foreground">{t("sessions.scheduledTasks.editor.confirmation.host")}</p>
      <p className="typography-micro text-muted-foreground">
        {t(
          props.catchUpPolicy === "skip"
            ? "sessions.scheduledTasks.editor.confirmation.skip"
            : "sessions.scheduledTasks.editor.confirmation.catchUp",
        )}
      </p>
    </section>
  )
}
