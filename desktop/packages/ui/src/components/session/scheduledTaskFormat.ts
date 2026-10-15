/**
 * Display formatting for scheduled tasks and task families, shared by the
 * sidebar section and its tests. Pure: the caller passes the translator.
 */

import type { I18nKey, I18nParams } from "@/lib/i18n/store"
import type { ScheduledTask } from "@/lib/scheduledTasksApi"
import type { RuntimeSchedule } from "@/lib/scheduledTaskTransform"
import { relativeTimeParts } from "./scheduledTaskRelativeTime"
import { describeFamilySchedule, type ScheduledTaskFamily } from "./scheduledTaskFamilies"

export type ScheduledTaskTranslate = (key: I18nKey, params?: I18nParams) => string

const pad2 = (value: number): string => String(value).padStart(2, "0")

const WEEKDAY_KEYS: readonly I18nKey[] = [
  "sessions.scheduledTasks.dialog.schedule.weekdayShort.sun",
  "sessions.scheduledTasks.dialog.schedule.weekdayShort.mon",
  "sessions.scheduledTasks.dialog.schedule.weekdayShort.tue",
  "sessions.scheduledTasks.dialog.schedule.weekdayShort.wed",
  "sessions.scheduledTasks.dialog.schedule.weekdayShort.thu",
  "sessions.scheduledTasks.dialog.schedule.weekdayShort.fri",
  "sessions.scheduledTasks.dialog.schedule.weekdayShort.sat",
]

export const formatWeekday = (value: number, t: ScheduledTaskTranslate): string =>
  t(WEEKDAY_KEYS[value] ?? "sessions.scheduledTasks.dialog.schedule.weekdayShort.unknown")

export const formatSchedule = (task: Pick<ScheduledTask, "schedule">, t: ScheduledTaskTranslate): string => {
  const schedule = task.schedule as RuntimeSchedule
  const timezone = "timezone" in schedule ? schedule.timezone : undefined
  if (schedule.type === "daily") {
    if (timezone) {
      return t("sessions.scheduledTasks.dialog.schedule.dailyWithTimezone", { time: schedule.time, timezone })
    }
    return t("sessions.scheduledTasks.dialog.schedule.daily", { time: schedule.time })
  }
  if (schedule.type === "weekly") {
    const days = formatWeekday(schedule.day, t)
    if (timezone) {
      return t("sessions.scheduledTasks.dialog.schedule.weeklyWithTimezone", { days, time: schedule.time, timezone })
    }
    return t("sessions.scheduledTasks.dialog.schedule.weekly", { days, time: schedule.time })
  }
  if (schedule.type === "once") {
    const runAt = new Date(schedule.runAt)
    const date = `${runAt.getFullYear()}-${pad2(runAt.getMonth() + 1)}-${pad2(runAt.getDate())}`
    const time = `${pad2(runAt.getHours())}:${pad2(runAt.getMinutes())}`
    return t("sessions.scheduledTasks.dialog.schedule.once", { date, time })
  }
  if (timezone) {
    return t("sessions.scheduledTasks.dialog.schedule.cronWithTimezone", { cron: schedule.expression, timezone })
  }
  return t("sessions.scheduledTasks.dialog.schedule.cron", { cron: schedule.expression })
}

/** One line for a family: the shared times/weekdays when they form a grid, otherwise every part's schedule. */
export const formatFamilySchedule = (family: ScheduledTaskFamily, t: ScheduledTaskTranslate): string => {
  const description = describeFamilySchedule(family)
  if (!description.compact) {
    return family.members.map((member) => formatSchedule(member, t)).join(" · ")
  }
  if (description.type === "daily") {
    const time = description.times.join(", ")
    if (description.timezone) {
      return t("sessions.scheduledTasks.dialog.schedule.dailyWithTimezone", { time, timezone: description.timezone })
    }
    return t("sessions.scheduledTasks.dialog.schedule.daily", { time })
  }
  if (description.type === "weekly") {
    const days = description.weekdays.map((day) => formatWeekday(day, t)).join(", ")
    const time = description.times.join(", ")
    if (description.timezone) {
      return t("sessions.scheduledTasks.dialog.schedule.weeklyWithTimezone", {
        days,
        time,
        timezone: description.timezone,
      })
    }
    return t("sessions.scheduledTasks.dialog.schedule.weekly", { days, time })
  }
  return formatSchedule(family.primary, t)
}

/** Local wall-clock time, with the date when it is not today. */
export const formatRunMoment = (value: number | undefined, now: number = Date.now()): string => {
  if (!value || !Number.isFinite(value)) {
    return ""
  }
  const date = new Date(value)
  const time = date.toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" })
  if (date.toDateString() === new Date(now).toDateString()) {
    return time
  }
  const day = date.toLocaleDateString(undefined, { weekday: "short", month: "short", day: "numeric" })
  return `${day} ${time}`
}

export const formatRelativeTime = (
  value: number | undefined,
  t: ScheduledTaskTranslate,
  now: number = Date.now(),
): string => {
  const parts = relativeTimeParts(value, now)
  switch (parts.kind) {
    case "empty":
      return ""
    case "seconds":
      return parts.future
        ? t("sessions.scheduledTasks.dialog.relativeTime.inLessThanOneMinute")
        : t("sessions.scheduledTasks.dialog.relativeTime.justNow")
    case "minutes":
      return parts.future
        ? t("sessions.scheduledTasks.dialog.relativeTime.inMinutes", { count: parts.count })
        : t("sessions.scheduledTasks.dialog.relativeTime.minutesAgo", { count: parts.count })
    case "duration":
      return parts.future
        ? t("sessions.scheduledTasks.dialog.relativeTime.inDuration", { duration: parts.body })
        : t("sessions.scheduledTasks.dialog.relativeTime.durationAgo", { duration: parts.body })
  }
}
