import * as React from "react"
import { STARTUP_TIMEZONE } from "@/lib/startupTimezone"
import { Dialog, DialogContent, DialogTitle, DialogDescription } from "@/components/ui/dialog"
import { cn } from "@/lib/utils"
import { ScrollShadow } from "@/components/ui/ScrollShadow"
import { Input } from "@/components/ui/input"
import { Textarea } from "@/components/ui/textarea"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Checkbox } from "@/components/ui/checkbox"
import { Button } from "@/components/ui/button"
import { MobileOverlayPanel } from "@/components/ui/MobileOverlayPanel"
import { toast } from "@/components/ui"
import { ModelSelector } from "@/components/sections/agents/ModelSelector"
import { AgentSelector } from "@/components/sections/commands/AgentSelector"
import { isPrimaryMode } from "@/lib/modelControlUtils"
import {
  CommandAutocomplete,
  type CommandAutocompleteHandle,
  type CommandInfo,
} from "@/components/chat/CommandAutocomplete"
import { FileMentionAutocomplete, type FileMentionHandle } from "@/components/chat/FileMentionAutocomplete"
import { SnippetAutocomplete, type SnippetAutocompleteHandle } from "@/components/chat/SnippetAutocomplete"
import { detectTriggerQueryAtCursor, insertTriggerAtCursor } from "@/components/chat/chatInputMentions"
import { Icon } from "@/components/icon/Icon"
import { useConfigStore } from "@/stores/useConfigStore"
import { useUIStore } from "@/stores/useUIStore"
import type { ScheduledTask } from "@/lib/scheduledTasksApi"
import { stripFanOutSuffix, type ScheduledTaskDraftInput } from "@/lib/scheduledTaskTransform"
import { useI18n } from "@/lib/i18n"
import { describeFamilySchedule, type ScheduledTaskFamily } from "./scheduledTaskFamilies"
import { normalizeScheduledTaskTimes } from "./scheduledTaskTime"

const WEEKDAY_INDEXES = [0, 1, 2, 3, 4, 5, 6] as const

const TIMEZONE_OPTIONS = (() => {
  if (typeof Intl !== "undefined" && typeof Intl.supportedValuesOf === "function") {
    return Intl.supportedValuesOf("timeZone")
  }
  return [
    "UTC",
    "Europe/Kyiv",
    "Europe/London",
    "Europe/Berlin",
    "America/New_York",
    "America/Los_Angeles",
    "Asia/Tokyo",
  ]
})()

// `Intl.supportedValuesOf("timeZone")` omits "UTC", while migrated tasks and the
// fallback timezone use it. The selected value has to stay selectable even when
// it is not in the platform list.
// eslint-disable-next-line react-refresh/only-export-components -- Exported for the timezone regression tests.
export const buildTimezoneOptions = (selected: string): string[] =>
  Array.from(new Set([selected, "UTC", ...TIMEZONE_OPTIONS].filter(Boolean)))

/**
 * Format an instant as wall-clock date and time in `timeZone`. A once task has to
 * be read back in the timezone the save will reinterpret it in, otherwise an
 * unrelated edit shifts its run time by the difference between the zones.
 */
// eslint-disable-next-line react-refresh/only-export-components -- Exported for the timezone regression tests.
export const formatWallClockInTimeZone = (
  date: Date,
  timeZone: string,
): { date: string; time: string } | null => {
  try {
    const parts = new Intl.DateTimeFormat("en-US", {
      timeZone,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      hourCycle: "h23",
    }).formatToParts(date)
    const values = new Map(parts.map((part) => [part.type, part.value]))
    const year = values.get("year")
    const month = values.get("month")
    const day = values.get("day")
    const hour = values.get("hour")
    const minute = values.get("minute")
    if (!year || !month || !day || !hour || !minute) {
      return null
    }
    return { date: `${year}-${month}-${day}`, time: `${hour}:${minute}` }
  } catch {
    return null
  }
}

const getLocalDateISO = () => {
  const now = new Date()
  const year = now.getFullYear()
  const month = String(now.getMonth() + 1).padStart(2, "0")
  const day = String(now.getDate()).padStart(2, "0")
  return `${year}-${month}-${day}`
}

const parseISODateToLocal = (value: string): Date | null => {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value)
  if (!match) {
    return null
  }
  const year = Number(match[1])
  const month = Number(match[2])
  const day = Number(match[3])
  const date = new Date(year, month - 1, day)
  if (
    Number.isNaN(date.getTime()) ||
    date.getFullYear() !== year ||
    date.getMonth() !== month - 1 ||
    date.getDate() !== day
  ) {
    return null
  }
  return date
}

const formatLocalDateISO = (date: Date): string => {
  const year = date.getFullYear()
  const month = String(date.getMonth() + 1).padStart(2, "0")
  const day = String(date.getDate()).padStart(2, "0")
  return `${year}-${month}-${day}`
}

const formatDateLabel = (isoDate: string, fallbackLabel: string, locale: string): string => {
  const date = parseISODateToLocal(isoDate)
  if (!date) {
    return fallbackLabel
  }
  return new Intl.DateTimeFormat(locale, {
    month: "short",
    day: "numeric",
    year: "numeric",
  }).format(date)
}

const shiftMonth = (date: Date, delta: number): Date => {
  return new Date(date.getFullYear(), date.getMonth() + delta, 1)
}

const getCalendarCells = (monthDate: Date, weekStartsOn: number): Array<{ date: Date; inCurrentMonth: boolean }> => {
  const year = monthDate.getFullYear()
  const month = monthDate.getMonth()
  const firstDay = new Date(year, month, 1)
  const firstWeekday = firstDay.getDay()
  const leadDays = (firstWeekday - weekStartsOn + 7) % 7
  const daysInMonth = new Date(year, month + 1, 0).getDate()
  const daysInPrevMonth = new Date(year, month, 0).getDate()

  const cells: Array<{ date: Date; inCurrentMonth: boolean }> = []
  for (let index = 0; index < 42; index += 1) {
    const dayOffset = index - leadDays + 1
    if (dayOffset <= 0) {
      const day = daysInPrevMonth + dayOffset
      cells.push({ date: new Date(year, month - 1, day), inCurrentMonth: false })
      continue
    }
    if (dayOffset > daysInMonth) {
      cells.push({ date: new Date(year, month + 1, dayOffset - daysInMonth), inCurrentMonth: false })
      continue
    }
    cells.push({ date: new Date(year, month, dayOffset), inCurrentMonth: true })
  }
  return cells
}

const parse24hTime = (value: string): { hour24: string; hour12: string; minute: string; meridiem: "AM" | "PM" } => {
  const match = /^([01]\d|2[0-3]):([0-5]\d)$/.exec(value)
  if (!match) {
    return { hour24: "00", hour12: "12", minute: "00", meridiem: "AM" }
  }
  const hour24 = Number(match[1])
  const minute = match[2]
  const meridiem = hour24 >= 12 ? "PM" : "AM"
  const rawHour12 = hour24 % 12 === 0 ? 12 : hour24 % 12
  return {
    hour24: String(hour24).padStart(2, "0"),
    hour12: String(rawHour12).padStart(2, "0"),
    minute,
    meridiem,
  }
}

const to24hTime = (hour12: string, minute: string, meridiem: "AM" | "PM"): string => {
  const hourNumRaw = Number(hour12)
  const minuteNumRaw = Number(minute)
  const hourNum = Number.isFinite(hourNumRaw) ? Math.min(12, Math.max(1, hourNumRaw)) : 12
  const minuteNum = Number.isFinite(minuteNumRaw) ? Math.min(59, Math.max(0, minuteNumRaw)) : 0

  let hour24 = hourNum % 12
  if (meridiem === "PM") {
    hour24 += 12
  }
  return `${String(hour24).padStart(2, "0")}:${String(minuteNum).padStart(2, "0")}`
}

const getValidNumber = (value: string, config: { max: number; min?: number; loop?: boolean }) => {
  const { max, min = 0, loop = false } = config
  let numericValue = Number.parseInt(value, 10)

  if (Number.isFinite(numericValue)) {
    if (!loop) {
      if (numericValue > max) {
        numericValue = max
      }
      if (numericValue < min) {
        numericValue = min
      }
    } else {
      if (numericValue > max) {
        numericValue = min
      }
      if (numericValue < min) {
        numericValue = max
      }
    }
    return String(numericValue).padStart(2, "0")
  }

  return "00"
}

const getValid12Hour = (value: string) => {
  if (/^(0[1-9]|1[0-2])$/.test(value)) {
    return value
  }
  return getValidNumber(value, { min: 1, max: 12 })
}

const getValidMinute = (value: string) => {
  if (/^[0-5][0-9]$/.test(value)) {
    return value
  }
  return getValidNumber(value, { max: 59 })
}

const getArrowHour = (value: string, step: number) => {
  return getValidNumber(String(Number.parseInt(value, 10) + step), { min: 1, max: 12, loop: true })
}

const getArrowMinute = (value: string, step: number) => {
  return getValidNumber(String(Number.parseInt(value, 10) + step), { min: 0, max: 59, loop: true })
}

const getWeekStartsOn = (locale: string): number => {
  try {
    const localeApi = (
      Intl as unknown as {
        Locale?: new (tag: string) => {
          weekInfo?: { firstDay?: number }
          getWeekInfo?: () => { firstDay?: number } | undefined
        }
      }
    ).Locale
    if (typeof localeApi !== "function") {
      return 1
    }
    // `weekInfo` was removed from the shipped runtime (it is undefined there), so
    // every locale used to fall back to Monday; read the current accessor first.
    const localeInstance = new localeApi(locale)
    const weekInfo = localeInstance.getWeekInfo?.() ?? localeInstance.weekInfo
    const firstDayRaw = weekInfo?.firstDay
    if (typeof firstDayRaw !== "number") {
      return 1
    }
    return firstDayRaw % 7
  } catch {
    return 1
  }
}

const getUses24Hour = (locale: string): boolean => {
  try {
    const options = new Intl.DateTimeFormat(locale, { hour: "numeric" }).resolvedOptions()
    if (typeof options.hour12 === "boolean") {
      return !options.hour12
    }
    return options.hourCycle === "h23" || options.hourCycle === "h24"
  } catch {
    return true
  }
}

const getLocalizedWeekdayLabels = (locale: string): string[] => {
  const formatter = new Intl.DateTimeFormat(locale, { weekday: "short" })
  const sundayBase = new Date(2023, 0, 1)
  return WEEKDAY_INDEXES.map((offset) =>
    formatter.format(new Date(sundayBase.getFullYear(), sundayBase.getMonth(), sundayBase.getDate() + offset)),
  )
}

const rotateWeekdays = <T,>(items: T[], weekStartsOn: number): T[] => {
  return [...items.slice(weekStartsOn), ...items.slice(0, weekStartsOn)]
}

interface TimePillProps {
  value: string
  onChange: (next: string) => void
  use24Hour: boolean
  hourAriaLabel: string
  minuteAriaLabel: string
  periodAriaLabel: string
  amLabel: string
  pmLabel: string
}

const FieldLabel: React.FC<{
  htmlFor?: string
  required?: boolean
  children: React.ReactNode
}> = ({ htmlFor, required, children }) => (
  <div className="flex items-center gap-1.5">
    <label htmlFor={htmlFor} className="typography-meta font-medium text-foreground">
      {children}
      {required && <span className="ml-0.5 text-destructive">*</span>}
    </label>
  </div>
)

const TimePill: React.FC<TimePillProps> = ({
  value,
  onChange,
  use24Hour,
  hourAriaLabel,
  minuteAriaLabel,
  periodAriaLabel,
  amLabel,
  pmLabel,
}) => {
  const parts = React.useMemo(() => parse24hTime(value), [value])
  const hourRef = React.useRef<HTMLInputElement>(null)
  const minuteRef = React.useRef<HTMLInputElement>(null)
  const [hourDraft, setHourDraftState] = React.useState<string | null>(null)
  const [minuteDraft, setMinuteDraftState] = React.useState<string | null>(null)
  const hourDraftRef = React.useRef<string | null>(null)
  const minuteDraftRef = React.useRef<string | null>(null)

  const setHourDraft = React.useCallback((next: string | null) => {
    hourDraftRef.current = next
    setHourDraftState(next)
  }, [])
  const setMinuteDraft = React.useCallback((next: string | null) => {
    minuteDraftRef.current = next
    setMinuteDraftState(next)
  }, [])

  const getValid24Hour = (hour: string) => getValidNumber(hour, { min: 0, max: 23 })
  const getArrow24Hour = (hour: string, step: number) =>
    getValidNumber(String(Number.parseInt(hour, 10) + step), {
      min: 0,
      max: 23,
      loop: true,
    })
  const to24hFrom24Hour = (hour24: string, minute: string) => {
    const hourNumRaw = Number(hour24)
    const minuteNumRaw = Number(minute)
    const hourNum = Number.isFinite(hourNumRaw) ? Math.min(23, Math.max(0, hourNumRaw)) : 0
    const minuteNum = Number.isFinite(minuteNumRaw) ? Math.min(59, Math.max(0, minuteNumRaw)) : 0
    return `${String(hourNum).padStart(2, "0")}:${String(minuteNum).padStart(2, "0")}`
  }

  const onHourChange = (raw: string) => {
    const digits = raw.replace(/\D/g, "").slice(0, 2)
    setHourDraft(digits)
    if (digits.length === 2) {
      if (use24Hour) {
        onChange(to24hFrom24Hour(getValid24Hour(digits), parts.minute))
      } else {
        onChange(to24hTime(getValid12Hour(digits), parts.minute, parts.meridiem))
      }
      setHourDraft(null)
      minuteRef.current?.focus()
    }
  }
  const commitHour = () => {
    const digits = hourDraftRef.current
    if (digits === null) return
    setHourDraft(null)
    if (digits.length === 0) return
    if (use24Hour) {
      onChange(to24hFrom24Hour(getValid24Hour(digits.padStart(2, "0")), parts.minute))
      return
    }
    onChange(to24hTime(getValid12Hour(digits.padStart(2, "0")), parts.minute, parts.meridiem))
  }
  const onMinuteChange = (raw: string) => {
    const digits = raw.replace(/\D/g, "").slice(0, 2)
    setMinuteDraft(digits)
    if (digits.length === 2) {
      onChange(
        use24Hour
          ? to24hFrom24Hour(parts.hour24, getValidMinute(digits))
          : to24hTime(parts.hour12, getValidMinute(digits), parts.meridiem),
      )
      setMinuteDraft(null)
    }
  }
  const commitMinute = () => {
    const digits = minuteDraftRef.current
    if (digits === null) return
    setMinuteDraft(null)
    if (digits.length === 0) return
    onChange(
      use24Hour
        ? to24hFrom24Hour(parts.hour24, getValidMinute(digits.padStart(2, "0")))
        : to24hTime(parts.hour12, getValidMinute(digits.padStart(2, "0")), parts.meridiem),
    )
  }
  const stepHour = (step: number) =>
    onChange(
      use24Hour
        ? to24hFrom24Hour(getArrow24Hour(parts.hour24, step), parts.minute)
        : to24hTime(getArrowHour(parts.hour12, step), parts.minute, parts.meridiem),
    )
  const stepMinute = (step: number) =>
    onChange(
      use24Hour
        ? to24hFrom24Hour(parts.hour24, getArrowMinute(parts.minute, step))
        : to24hTime(parts.hour12, getArrowMinute(parts.minute, step), parts.meridiem),
    )
  const setPeriod = (next: "AM" | "PM") => {
    if (next !== parts.meridiem) {
      onChange(to24hTime(parts.hour12, parts.minute, next))
    }
  }

  const onHourKeyDown = (event: React.KeyboardEvent<HTMLInputElement>) => {
    if (event.key === "ArrowRight") {
      event.preventDefault()
      commitHour()
      minuteRef.current?.focus()
      return
    }
    if (event.key === "ArrowUp" || event.key === "ArrowDown") {
      event.preventDefault()
      setHourDraft(null)
      stepHour(event.key === "ArrowUp" ? 1 : -1)
    }
  }
  const onMinuteKeyDown = (event: React.KeyboardEvent<HTMLInputElement>) => {
    if (event.key === "ArrowLeft" && (event.currentTarget.selectionStart ?? 0) === 0) {
      event.preventDefault()
      commitMinute()
      hourRef.current?.focus()
      return
    }
    if (event.key === "ArrowUp" || event.key === "ArrowDown") {
      event.preventDefault()
      setMinuteDraft(null)
      stepMinute(event.key === "ArrowUp" ? 1 : -1)
    }
  }

  return (
    <div
      className={cn(
        "inline-flex h-9 w-fit items-center gap-1 rounded-md border border-border bg-background focus-within:ring-1 focus-within:ring-interactive-focusRing focus-within:border-interactive-focusRing",
        use24Hour ? "px-2" : "pl-2 pr-1",
      )}
    >
      <input
        ref={hourRef}
        inputMode="numeric"
        value={hourDraft ?? (use24Hour ? parts.hour24 : parts.hour12)}
        onChange={(event) => onHourChange(event.target.value)}
        onKeyDown={onHourKeyDown}
        onFocus={() => setHourDraft("")}
        onBlur={commitHour}
        maxLength={2}
        aria-label={hourAriaLabel}
        className="h-7 w-7 shrink-0 rounded-sm bg-transparent text-center font-mono typography-ui-label tabular-nums text-foreground outline-none caret-transparent focus:bg-interactive-hover"
      />
      <span className="font-mono typography-ui-label text-muted-foreground">:</span>
      <input
        ref={minuteRef}
        inputMode="numeric"
        value={minuteDraft ?? parts.minute}
        onChange={(event) => onMinuteChange(event.target.value)}
        onKeyDown={onMinuteKeyDown}
        onFocus={() => setMinuteDraft("")}
        onBlur={commitMinute}
        maxLength={2}
        aria-label={minuteAriaLabel}
        className="h-7 w-7 shrink-0 rounded-sm bg-transparent text-center font-mono typography-ui-label tabular-nums text-foreground outline-none caret-transparent focus:bg-interactive-hover"
      />
      {!use24Hour ? (
        <Select value={parts.meridiem} onValueChange={(next) => setPeriod(next as "AM" | "PM")}>
          <SelectTrigger
            aria-label={periodAriaLabel}
            className="ml-1 h-7 w-fit border-0 bg-transparent pl-2 pr-1 shadow-none hover:bg-interactive-hover focus:ring-0"
          >
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="AM">{amLabel}</SelectItem>
            <SelectItem value="PM">{pmLabel}</SelectItem>
          </SelectContent>
        </Select>
      ) : null}
    </div>
  )
}

const startOfMonth = (date: Date) => new Date(date.getFullYear(), date.getMonth(), 1)

const startOfToday = () => {
  const now = new Date()
  return new Date(now.getFullYear(), now.getMonth(), now.getDate())
}

const isSameCalendarDay = (a: Date, b: Date) =>
  a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate()

type ScheduledTaskDraft = {
  id?: string
  name: string
  enabled: boolean
  catchUpPolicy: "run_once" | "skip"
  schedule: {
    kind: "daily" | "weekly" | "once"
    times: string[]
    onceDate: string
    onceTime: string
    weekdays: number[]
    timezone: string
  }
  execution: {
    prompt: string
    providerID: string
    modelID: string
    agent: string
  }
}

const pad2 = (value: number): string => String(value).padStart(2, "0")

type Translate = ReturnType<typeof useI18n>["t"]

const weekdayShort = (value: number, t: Translate): string => {
  if (value === 0) return t("sessions.scheduledTasks.dialog.schedule.weekdayShort.sun")
  if (value === 1) return t("sessions.scheduledTasks.dialog.schedule.weekdayShort.mon")
  if (value === 2) return t("sessions.scheduledTasks.dialog.schedule.weekdayShort.tue")
  if (value === 3) return t("sessions.scheduledTasks.dialog.schedule.weekdayShort.wed")
  if (value === 4) return t("sessions.scheduledTasks.dialog.schedule.weekdayShort.thu")
  if (value === 5) return t("sessions.scheduledTasks.dialog.schedule.weekdayShort.fri")
  if (value === 6) return t("sessions.scheduledTasks.dialog.schedule.weekdayShort.sat")
  return t("sessions.scheduledTasks.dialog.schedule.weekdayShort.unknown")
}

// Slot list for the irregular-family note. Daily and weekly stay as the bare
// slot ("09:00", "Mon 09:00"); once and cron use the dialog's schedule copy.
const formatMemberSchedule = (member: ScheduledTask, t: Translate): string => {
  const schedule = member.schedule
  if (schedule.type === "daily") {
    return schedule.time
  }
  if (schedule.type === "weekly") {
    return `${weekdayShort(schedule.day, t)} ${schedule.time}`
  }
  if (schedule.type === "once") {
    const runAt = new Date(schedule.runAt)
    if (Number.isNaN(runAt.getTime())) {
      return t("sessions.scheduledTasks.dialog.schedule.unknownDate")
    }
    const date = `${runAt.getFullYear()}-${pad2(runAt.getMonth() + 1)}-${pad2(runAt.getDate())}`
    const time = `${pad2(runAt.getHours())}:${pad2(runAt.getMinutes())}`
    return t("sessions.scheduledTasks.dialog.schedule.once", { date, time })
  }
  const timezone = schedule.timezone
  if (timezone) {
    return t("sessions.scheduledTasks.dialog.schedule.cronWithTimezone", {
      cron: schedule.expression,
      timezone,
    })
  }
  return t("sessions.scheduledTasks.dialog.schedule.cron", { cron: schedule.expression })
}

const normalizeDraftTimes = (task: ScheduledTask | null): string[] => {
  if (!task) {
    return ["09:00"]
  }
  const schedule = task.schedule
  const candidates =
    (schedule.type === "daily" || schedule.type === "weekly") && typeof schedule.time === "string"
      ? [schedule.time]
      : []

  const unique = normalizeScheduledTaskTimes(candidates)
  return unique.length > 0 ? unique : ["09:00"]
}

const unionMemberTimes = (members: readonly ScheduledTask[]): string[] => {
  const times = normalizeScheduledTaskTimes(
    members.flatMap((member) => {
      const schedule = member.schedule
      return schedule.type === "daily" || schedule.type === "weekly" ? [schedule.time] : []
    }),
  )
  return times.length > 0 ? times : ["09:00"]
}

const unionMemberWeekdays = (members: readonly ScheduledTask[]): number[] => {
  const days = Array.from(
    new Set(members.flatMap((member) => (member.schedule.type === "weekly" ? [member.schedule.day] : []))),
  ).sort((a, b) => a - b)
  return days.length > 0 ? days : [1]
}

const scheduleSectionKey = (schedule: ScheduledTaskDraft["schedule"]): string =>
  JSON.stringify({
    kind: schedule.kind,
    times: normalizeScheduledTaskTimes(schedule.times),
    weekdays: Array.from(new Set(schedule.weekdays)).sort((a, b) => a - b),
    onceDate: schedule.onceDate,
    onceTime: schedule.onceTime,
    timezone: schedule.timezone.trim(),
  })

// eslint-disable-next-line react-refresh/only-export-components -- Exported for the timezone regression tests.
export const toDraft = (
  task: ScheduledTask | null,
  defaults: {
    providerID: string
    modelID: string
    agent: string
  },
  family?: ScheduledTaskFamily,
): ScheduledTaskDraft => {
  const timezoneFallback = STARTUP_TIMEZONE
  const source = family?.primary ?? task
  if (!source) {
    return {
      name: "",
      enabled: true,
      catchUpPolicy: "run_once",
      schedule: {
        kind: "daily",
        times: ["09:00"],
        onceDate: getLocalDateISO(),
        onceTime: "09:00",
        weekdays: [1],
        timezone: timezoneFallback,
      },
      execution: {
        prompt: "",
        providerID: defaults.providerID,
        modelID: defaults.modelID,
        agent: defaults.agent,
      },
    }
  }

  const schedule = source.schedule
  const scheduleTimezone = "timezone" in schedule && schedule.timezone ? schedule.timezone : timezoneFallback
  const onceRunAt = schedule.type === "once" ? new Date(schedule.runAt) : null
  // Read the run time back in the same timezone the save reinterprets it in.
  // Local getters only round-trip when that timezone is the machine's own.
  const onceWallClock = onceRunAt ? formatWallClockInTimeZone(onceRunAt, scheduleTimezone) : null
  const weekly = schedule.type === "weekly"
  return {
    id: source.id,
    // Editing a fan-out shows the base name again so re-saving does not stack
    // " (i/N)" suffixes. A family uses its primary part's base title.
    name: stripFanOutSuffix(source.title),
    enabled: family ? family.anyActive : source.status === "active",
    catchUpPolicy: source.catchUpPolicy === "skip" ? "skip" : "run_once",
    schedule: {
      kind: schedule.type === "once" ? "once" : weekly ? "weekly" : "daily",
      times: family ? unionMemberTimes(family.members) : normalizeDraftTimes(source),
      onceDate: onceWallClock?.date ?? getLocalDateISO(),
      onceTime: onceWallClock?.time ?? "09:00",
      weekdays: family && weekly ? unionMemberWeekdays(family.members) : weekly ? [schedule.day] : [1],
      timezone: scheduleTimezone,
    },
    execution: {
      prompt: source.prompt,
      providerID: source.model?.providerID || defaults.providerID,
      modelID: source.model?.modelID || defaults.modelID,
      agent: source.agent || "",
    },
  }
}

const validateDraft = (draft: ScheduledTaskDraft, t: ReturnType<typeof useI18n>["t"]): string | null => {
  if (!draft.name.trim()) {
    return t("sessions.scheduledTasks.editor.validation.taskNameRequired")
  }
  if (!draft.execution.prompt.trim()) {
    return t("sessions.scheduledTasks.editor.validation.promptRequired")
  }
  if (!draft.execution.providerID.trim() || !draft.execution.modelID.trim()) {
    return t("sessions.scheduledTasks.editor.validation.modelRequired")
  }

  if (draft.schedule.kind === "once") {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(draft.schedule.onceDate)) {
      return t("sessions.scheduledTasks.editor.validation.dateFormat")
    }
    if (!/^([01]\d|2[0-3]):([0-5]\d)$/.test(draft.schedule.onceTime)) {
      return t("sessions.scheduledTasks.editor.validation.timeFormat")
    }
  } else {
    const validTimes = draft.schedule.times.filter((value) => /^([01]\d|2[0-3]):([0-5]\d)$/.test(value))
    if (validTimes.length === 0) {
      return t("sessions.scheduledTasks.editor.validation.atLeastOneTime")
    }
  }

  if (draft.schedule.kind === "weekly" && draft.schedule.weekdays.length === 0) {
    return t("sessions.scheduledTasks.editor.validation.atLeastOneWeekday")
  }

  if (!draft.schedule.timezone.trim()) {
    return t("sessions.scheduledTasks.editor.validation.timezoneRequired")
  }

  return null
}

export type ScheduledTaskEditorSubmit = {
  /** Primary member id when editing. */
  id?: string
  /** Ids of every member the editor was opened with. Editing only. */
  memberIDs?: string[]
  enabled: boolean
  /** The enabled switch differs from when the editor opened. True for a new task. */
  enabledChanged: boolean
  /** The schedule section differs from when the editor opened. True for a new task. */
  scheduleChanged: boolean
  input: ScheduledTaskDraftInput
}

export function ScheduledTaskEditorDialog(props: {
  open: boolean
  /** The family's primary member when editing; null for a new task. */
  task: ScheduledTask | null
  /** The whole family when editing. `family.members` includes `task`. */
  family?: ScheduledTaskFamily
  /** Display name of the project the task belongs to, shown under the title. */
  projectLabel?: string
  onOpenChange: (open: boolean) => void
  onSave: (submit: ScheduledTaskEditorSubmit) => Promise<void>
}) {
  const { open, task, family, projectLabel, onOpenChange, onSave } = props
  const { t, formatLocale } = useI18n()
  const loadProviders = useConfigStore((state) => state.loadProviders)
  const loadAgents = useConfigStore((state) => state.loadAgents)
  const currentProviderID = useConfigStore((state) => state.currentProviderId)
  const currentModelID = useConfigStore((state) => state.currentModelId)
  const currentAgentName = useConfigStore((state) => state.currentAgentName || "")
  const timeFormatPreference = useUIStore((state) => state.timeFormatPreference)
  const weekStartPreference = useUIStore((state) => state.weekStartPreference)
  const isMobile = useUIStore((state) => state.isMobile)

  const [draft, setDraft] = React.useState<ScheduledTaskDraft>(() =>
    toDraft(
      task,
      {
        providerID: currentProviderID,
        modelID: currentModelID,
        agent: currentAgentName,
      },
      family,
    ),
  )
  const openedRef = React.useRef<{ baseline: ScheduledTaskDraft; memberIDs?: string[] }>({
    baseline: draft,
    ...(task && family ? { memberIDs: family.members.map((member) => member.id) } : {}),
  })
  const [saving, setSaving] = React.useState(false)
  const [isDatePickerOpen, setIsDatePickerOpen] = React.useState(false)
  const [showFileMention, setShowFileMention] = React.useState(false)
  const [mentionQuery, setMentionQuery] = React.useState("")
  const [showCommandAutocomplete, setShowCommandAutocomplete] = React.useState(false)
  const [commandQuery, setCommandQuery] = React.useState("")
  const [showSnippetAutocomplete, setShowSnippetAutocomplete] = React.useState(false)
  const [snippetQuery, setSnippetQuery] = React.useState("")
  const [calendarMonth, setCalendarMonth] = React.useState<Date>(() => {
    const source = family?.primary ?? task
    const initialDate =
      (source?.schedule.type === "once"
        ? parseISODateToLocal(formatLocalDateISO(new Date(source.schedule.runAt)))
        : null) || new Date()
    return new Date(initialDate.getFullYear(), initialDate.getMonth(), 1)
  })
  const datePickerRef = React.useRef<HTMLDivElement>(null)
  const promptTextareaRef = React.useRef<HTMLTextAreaElement>(null)
  const mentionRef = React.useRef<FileMentionHandle>(null)
  const commandRef = React.useRef<CommandAutocompleteHandle>(null)
  const snippetRef = React.useRef<SnippetAutocompleteHandle>(null)
  const timezoneOptions = React.useMemo(
    () => buildTimezoneOptions(draft.schedule.timezone),
    [draft.schedule.timezone],
  )
  const localeUse24Hour = React.useMemo(() => getUses24Hour(formatLocale), [formatLocale])
  const localeWeekStartsOn = React.useMemo(() => getWeekStartsOn(formatLocale), [formatLocale])
  const use24Hour = React.useMemo(() => {
    if (timeFormatPreference === "24h") {
      return true
    }
    if (timeFormatPreference === "12h") {
      return false
    }
    return localeUse24Hour
  }, [timeFormatPreference, localeUse24Hour])
  const weekStartsOn = React.useMemo(() => {
    if (weekStartPreference === "sunday") {
      return 0
    }
    if (weekStartPreference === "monday") {
      return 1
    }
    return localeWeekStartsOn
  }, [weekStartPreference, localeWeekStartsOn])
  const orderedWeekdays = React.useMemo(() => {
    const labels = getLocalizedWeekdayLabels(formatLocale)
    return rotateWeekdays(
      WEEKDAY_INDEXES.map((value) => ({ value, label: labels[value] || "" })),
      weekStartsOn,
    )
  }, [formatLocale, weekStartsOn])

  React.useEffect(() => {
    if (!open) {
      return
    }
    void loadProviders()
    void loadAgents()
  }, [open, loadProviders, loadAgents])

  // The provider, model and agent are read into the initial draft, but they must not re-run the
  // reset below: the effect above loads them on open, and `useConfigStore` rewrites the current
  // selection when the stored one is not selectable — a background agent or model change does the
  // same. That reset replaced the draft the user was typing, and the `openedRef` baseline under
  // it, with a fresh one. Read them through a ref so the deps stay what the reset belongs to.
  const initialSelectionRef = React.useRef({
    providerID: currentProviderID,
    modelID: currentModelID,
    agent: currentAgentName,
  })
  initialSelectionRef.current = {
    providerID: currentProviderID,
    modelID: currentModelID,
    agent: currentAgentName,
  }

  React.useEffect(() => {
    if (!open) {
      return
    }
    const next = toDraft(task, initialSelectionRef.current, family)
    setDraft(next)
    openedRef.current = {
      baseline: next,
      ...(task && family ? { memberIDs: family.members.map((member) => member.id) } : {}),
    }
    const source = family?.primary ?? task
    const sourceDate = (source?.schedule.type === "once" ? new Date(source.schedule.runAt) : null) || new Date()
    setCalendarMonth(new Date(sourceDate.getFullYear(), sourceDate.getMonth(), 1))
    setIsDatePickerOpen(false)
    setShowCommandAutocomplete(false)
    setShowFileMention(false)
    setCommandQuery("")
    setMentionQuery("")
  }, [open, task, family])

  React.useEffect(() => {
    if (!isDatePickerOpen) {
      return
    }

    const onPointerDown = (event: MouseEvent) => {
      if (datePickerRef.current && !datePickerRef.current.contains(event.target as Node)) {
        setIsDatePickerOpen(false)
      }
    }

    document.addEventListener("mousedown", onPointerDown)
    return () => {
      document.removeEventListener("mousedown", onPointerDown)
    }
  }, [isDatePickerOpen])

  const toggleWeekday = React.useCallback((weekday: number, nextChecked: boolean) => {
    setDraft((prev) => {
      const current = new Set(prev.schedule.weekdays)
      if (nextChecked) {
        current.add(weekday)
      } else {
        current.delete(weekday)
      }
      return {
        ...prev,
        schedule: {
          ...prev.schedule,
          weekdays: Array.from(current).sort((a, b) => a - b),
        },
      }
    })
  }, [])

  const updateTimeAt = React.useCallback((index: number, value: string) => {
    setDraft((prev) => {
      const next = prev.schedule.times.slice()
      next[index] = value
      return {
        ...prev,
        schedule: {
          ...prev.schedule,
          times: next,
        },
      }
    })
  }, [])

  const removeTimeAt = React.useCallback((index: number) => {
    setDraft((prev) => {
      const next = prev.schedule.times.filter((_, idx) => idx !== index)
      return {
        ...prev,
        schedule: {
          ...prev.schedule,
          times: next.length > 0 ? next : ["09:00"],
        },
      }
    })
  }, [])

  const addTime = React.useCallback(() => {
    setDraft((prev) => ({
      ...prev,
      schedule: {
        ...prev.schedule,
        times: [...prev.schedule.times, "12:00"],
      },
    }))
  }, [])

  const todayDate = React.useMemo(() => startOfToday(), [])
  const currentMonthStart = React.useMemo(() => startOfMonth(todayDate), [todayDate])
  const selectedDateLabel = React.useMemo(() => {
    const selectedDate = parseISODateToLocal(draft.schedule.onceDate)
    if (!selectedDate) {
      return null
    }
    if (isSameCalendarDay(selectedDate, todayDate)) {
      return t("sessions.scheduledTasks.editor.date.today")
    }
    return new Intl.DateTimeFormat(formatLocale, { weekday: "short" }).format(selectedDate)
  }, [draft.schedule.onceDate, formatLocale, t, todayDate])
  const isAtCurrentMonth = React.useMemo(
    () => startOfMonth(calendarMonth).getTime() <= currentMonthStart.getTime(),
    [calendarMonth, currentMonthStart],
  )
  const calendarWeekdayLabels = React.useMemo(() => orderedWeekdays.map((weekday) => weekday.label), [orderedWeekdays])

  const setOneTimeDate = React.useCallback((isoDate: string) => {
    setDraft((prev) => ({
      ...prev,
      schedule: {
        ...prev.schedule,
        onceDate: isoDate,
      },
    }))
  }, [])

  const updateAutocompleteState = React.useCallback((value: string, cursorPosition: number) => {
    if (value.startsWith("/")) {
      const firstSpace = value.indexOf(" ")
      const firstNewline = value.indexOf("\n")
      const commandEnd = Math.min(
        firstSpace === -1 ? value.length : firstSpace,
        firstNewline === -1 ? value.length : firstNewline,
      )

      if (cursorPosition <= commandEnd && firstSpace === -1) {
        setCommandQuery(value.substring(1, commandEnd))
        setShowCommandAutocomplete(true)
        setShowFileMention(false)
        setShowSnippetAutocomplete(false)
        return
      }
    }

    setShowCommandAutocomplete(false)

    const textBeforeCursor = value.substring(0, cursorPosition)
    const detectedSnippetQuery = detectTriggerQueryAtCursor(textBeforeCursor, "#")
    if (detectedSnippetQuery !== null) {
      setSnippetQuery(detectedSnippetQuery)
      setShowSnippetAutocomplete(true)
      setShowFileMention(false)
      return
    }

    setShowSnippetAutocomplete(false)

    const detectedMentionQuery = detectTriggerQueryAtCursor(textBeforeCursor, "@")
    if (detectedMentionQuery !== null) {
      setMentionQuery(detectedMentionQuery)
      setShowFileMention(true)
      return
    }

    setShowFileMention(false)
  }, [])

  const setPromptValue = React.useCallback((value: string) => {
    setDraft((prev) => ({
      ...prev,
      execution: {
        ...prev.execution,
        prompt: value,
      },
    }))
  }, [])

  const handleFileSelect = React.useCallback(
    (file: { name: string; path: string; relativePath?: string }) => {
      const promptValue = draft.execution.prompt
      const textarea = promptTextareaRef.current
      const cursorPosition = textarea?.selectionStart ?? promptValue.length
      const mentionPath =
        file.relativePath && file.relativePath.trim().length > 0 ? file.relativePath.trim() : file.path || file.name

      const { newMessage: nextPrompt, nextCursor } = insertTriggerAtCursor(
        promptValue,
        cursorPosition,
        mentionPath,
        "@",
      )

      setPromptValue(nextPrompt)
      setShowFileMention(false)
      setMentionQuery("")

      requestAnimationFrame(() => {
        const currentTextarea = promptTextareaRef.current
        if (currentTextarea) {
          currentTextarea.selectionStart = nextCursor
          currentTextarea.selectionEnd = nextCursor
          currentTextarea.focus()
        }
        updateAutocompleteState(nextPrompt, nextCursor)
      })
    },
    [draft.execution.prompt, setPromptValue, updateAutocompleteState],
  )

  const handleAgentSelect = React.useCallback(
    (agentName: string) => {
      const promptValue = draft.execution.prompt
      const textarea = promptTextareaRef.current
      const cursorPosition = textarea?.selectionStart ?? promptValue.length
      const { newMessage: nextPrompt, nextCursor } = insertTriggerAtCursor(promptValue, cursorPosition, agentName, "@")

      setPromptValue(nextPrompt)
      setShowFileMention(false)
      setMentionQuery("")

      requestAnimationFrame(() => {
        const currentTextarea = promptTextareaRef.current
        if (currentTextarea) {
          currentTextarea.selectionStart = nextCursor
          currentTextarea.selectionEnd = nextCursor
          currentTextarea.focus()
        }
        updateAutocompleteState(nextPrompt, nextCursor)
      })
    },
    [draft.execution.prompt, setPromptValue, updateAutocompleteState],
  )

  const handleCommandSelect = React.useCallback(
    (command: CommandInfo) => {
      const nextPrompt = `/${command.name} `
      setPromptValue(nextPrompt)
      setShowCommandAutocomplete(false)
      setCommandQuery("")
      setShowSnippetAutocomplete(false)

      requestAnimationFrame(() => {
        const currentTextarea = promptTextareaRef.current
        if (currentTextarea) {
          currentTextarea.focus()
          currentTextarea.selectionStart = currentTextarea.value.length
          currentTextarea.selectionEnd = currentTextarea.value.length
        }
        updateAutocompleteState(nextPrompt, nextPrompt.length)
      })
    },
    [setPromptValue, updateAutocompleteState],
  )

  const handleSnippetSelect = React.useCallback(
    (_snippet: unknown, trigger: string) => {
      const promptValue = draft.execution.prompt
      const textarea = promptTextareaRef.current
      const cursorPosition = textarea?.selectionStart ?? promptValue.length
      const { newMessage: nextPrompt, nextCursor } = insertTriggerAtCursor(promptValue, cursorPosition, trigger, "#")

      setPromptValue(nextPrompt)
      setShowSnippetAutocomplete(false)
      setSnippetQuery("")

      requestAnimationFrame(() => {
        const currentTextarea = promptTextareaRef.current
        if (currentTextarea) {
          currentTextarea.selectionStart = nextCursor
          currentTextarea.selectionEnd = nextCursor
          currentTextarea.focus()
        }
        updateAutocompleteState(nextPrompt, nextCursor)
      })
    },
    [draft.execution.prompt, setPromptValue, updateAutocompleteState],
  )

  const handlePromptKeyDown = React.useCallback(
    (event: React.KeyboardEvent<HTMLTextAreaElement>) => {
      if (showCommandAutocomplete && commandRef.current) {
        if (
          event.key === "Enter" ||
          event.key === "ArrowUp" ||
          event.key === "ArrowDown" ||
          event.key === "Escape" ||
          event.key === "Tab"
        ) {
          event.preventDefault()
          commandRef.current.handleKeyDown(event.key)
          return
        }
      }

      if (showFileMention && mentionRef.current) {
        if (
          event.key === "Enter" ||
          event.key === "ArrowUp" ||
          event.key === "ArrowDown" ||
          event.key === "Escape" ||
          event.key === "Tab"
        ) {
          event.preventDefault()
          mentionRef.current.handleKeyDown(event.key)
        }
      }

      if (showSnippetAutocomplete && snippetRef.current) {
        if (
          event.key === "Enter" ||
          event.key === "ArrowUp" ||
          event.key === "ArrowDown" ||
          event.key === "Escape" ||
          event.key === "Tab"
        ) {
          event.preventDefault()
          snippetRef.current.handleKeyDown(event.key)
        }
      }
    },
    [showCommandAutocomplete, showFileMention, showSnippetAutocomplete],
  )

  const handleSubmit = React.useCallback(async () => {
    const validationError = validateDraft(draft, t)
    if (validationError) {
      toast.error(validationError)
      return
    }

    const normalizedTimes = normalizeScheduledTaskTimes(draft.schedule.times)
    const input: ScheduledTaskDraftInput = {
      name: draft.name.trim(),
      prompt: draft.execution.prompt,
      ...(draft.execution.agent.trim() ? { agent: draft.execution.agent.trim() } : {}),
      model: {
        providerID: draft.execution.providerID,
        modelID: draft.execution.modelID,
      },
      catchUpPolicy: draft.catchUpPolicy,
      schedule:
        draft.schedule.kind === "once"
          ? {
              kind: "once",
              date: draft.schedule.onceDate,
              time: draft.schedule.onceTime,
              timezone: draft.schedule.timezone.trim(),
            }
          : draft.schedule.kind === "weekly"
            ? {
                kind: "weekly",
                weekdays: draft.schedule.weekdays,
                times: normalizedTimes,
                timezone: draft.schedule.timezone.trim(),
              }
            : {
                kind: "daily",
                times: normalizedTimes,
                timezone: draft.schedule.timezone.trim(),
              },
    }

    const isNewTask = task === null
    const opened = openedRef.current
    setSaving(true)
    try {
      await onSave({
        ...(draft.id ? { id: draft.id } : {}),
        ...(opened.memberIDs && !isNewTask ? { memberIDs: opened.memberIDs } : {}),
        enabled: draft.enabled,
        enabledChanged: isNewTask || draft.enabled !== opened.baseline.enabled,
        scheduleChanged:
          isNewTask || scheduleSectionKey(draft.schedule) !== scheduleSectionKey(opened.baseline.schedule),
        input,
      })
      onOpenChange(false)
    } catch (error) {
      toast.error(error instanceof Error ? error.message : t("sessions.scheduledTasks.editor.toast.saveFailed"))
    } finally {
      setSaving(false)
    }
  }, [draft, onOpenChange, onSave, t, task])

  const descriptionId = React.useId()
  const hasOpenFloatingMenu = React.useCallback(() => {
    if (typeof document === "undefined") return false
    return Boolean(document.querySelector('[data-slot="dropdown-menu-content"], [data-slot="select-content"]'))
  }, [])

  const title = task ? t("sessions.scheduledTasks.editor.title.edit") : t("sessions.scheduledTasks.editor.title.new")
  const description = t("sessions.scheduledTasks.editor.description")
  const projectLine = projectLabel ? (
    <p className="typography-micro mt-0.5 inline-flex min-w-0 items-center gap-1 text-muted-foreground">
      <Icon name="folder" className="h-3.5 w-3.5 shrink-0" />
      <span className="truncate">{t("sessions.scheduledTasks.editor.projectLabel", { project: projectLabel })}</span>
    </p>
  ) : null
  const irregularScheduleNote =
    family && !describeFamilySchedule(family).compact
      ? t("sessions.scheduledTasks.editor.schedule.irregularNote", {
          schedules: family.members.map((member) => formatMemberSchedule(member, t)).join(", "),
        })
      : null

  const formBody = (
    <div className="flex flex-col gap-5">
      <div className="grid grid-cols-1 gap-x-4 gap-y-3 sm:grid-cols-2">
        <div className="flex flex-col gap-1">
          <FieldLabel htmlFor="sched-name" required>
            {t("sessions.scheduledTasks.editor.taskName.label")}
          </FieldLabel>
          <Input
            id="sched-name"
            value={draft.name}
            onChange={(event) => setDraft((prev) => ({ ...prev, name: event.target.value }))}
            placeholder={t("sessions.scheduledTasks.editor.taskName.placeholder")}
            maxLength={80}
            className="w-full sm:max-w-[220px]"
          />
        </div>

        <div className="flex flex-col gap-1">
          <FieldLabel>{t("sessions.scheduledTasks.editor.scheduleType.label")}</FieldLabel>
          <Select
            value={draft.schedule.kind}
            onValueChange={(value: "daily" | "weekly" | "once") => {
              setDraft((prev) => ({
                ...prev,
                schedule: { ...prev.schedule, kind: value },
              }))
            }}
          >
            <SelectTrigger className="w-fit max-w-full">
              <SelectValue>
                {(value) =>
                  value === "daily"
                    ? t("sessions.scheduledTasks.editor.scheduleType.daily")
                    : value === "weekly"
                      ? t("sessions.scheduledTasks.editor.scheduleType.weekly")
                      : t("sessions.scheduledTasks.editor.scheduleType.once")
                }
              </SelectValue>
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="daily">{t("sessions.scheduledTasks.editor.scheduleType.daily")}</SelectItem>
              <SelectItem value="weekly">{t("sessions.scheduledTasks.editor.scheduleType.weekly")}</SelectItem>
              <SelectItem value="once">{t("sessions.scheduledTasks.editor.scheduleType.once")}</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>

      {irregularScheduleNote ? (
        <div className="flex items-start gap-2 rounded-md border border-border bg-muted/40 px-3 py-2 typography-micro text-muted-foreground">
          <Icon name="information" className="mt-0.5 h-3.5 w-3.5 shrink-0" />
          <p>{irregularScheduleNote}</p>
        </div>
      ) : null}

      {draft.schedule.kind === "once" ? (
        <div className="grid grid-cols-1 gap-x-4 gap-y-3 sm:grid-cols-2">
          <div className="flex flex-col gap-1" ref={datePickerRef}>
            <FieldLabel>{t("sessions.scheduledTasks.editor.date.label")}</FieldLabel>
            <div className="relative">
              <button
                type="button"
                className="inline-flex h-9 w-fit max-w-full items-center justify-between gap-2 rounded-md border border-border bg-background px-3 text-left hover:bg-interactive-hover"
                onClick={() => setIsDatePickerOpen((prev) => !prev)}
              >
                <span className="inline-flex items-center gap-2">
                  <Icon name="calendar" className="h-4 w-4 text-muted-foreground" />
                  <span className="typography-ui-label text-foreground">
                    {formatDateLabel(
                      draft.schedule.onceDate,
                      t("sessions.scheduledTasks.editor.date.placeholder"),
                      formatLocale,
                    )}
                  </span>
                </span>
                <Icon name="arrow-down-s" className="h-4 w-4 text-muted-foreground" />
              </button>

              {isDatePickerOpen ? (
                <div className="absolute left-0 top-[calc(100%+6px)] z-50 w-[288px] rounded-xl border border-border bg-background p-3 shadow-sm">
                  <div className="mb-2 flex items-center justify-between">
                    <button
                      type="button"
                      className="inline-flex h-8 w-8 items-center justify-center rounded-md hover:bg-interactive-hover disabled:cursor-not-allowed disabled:opacity-40"
                      onClick={() => setCalendarMonth((prev) => shiftMonth(prev, -1))}
                      aria-label={t("sessions.scheduledTasks.editor.date.previousMonth")}
                      disabled={isAtCurrentMonth}
                    >
                      <Icon name="arrow-left-s" className="h-4 w-4" />
                    </button>
                    <div className="typography-ui-label text-foreground">
                      {new Intl.DateTimeFormat(formatLocale, { month: "long", year: "numeric" }).format(calendarMonth)}
                    </div>
                    <button
                      type="button"
                      className="inline-flex h-8 w-8 items-center justify-center rounded-md hover:bg-interactive-hover"
                      onClick={() => setCalendarMonth((prev) => shiftMonth(prev, 1))}
                      aria-label={t("sessions.scheduledTasks.editor.date.nextMonth")}
                    >
                      <Icon name="arrow-right-s" className="h-4 w-4" />
                    </button>
                  </div>

                  <div className="mb-1 grid grid-cols-7 gap-1 px-1">
                    {calendarWeekdayLabels.map((weekday, index) => (
                      <div
                        key={`${weekday}-${index}`}
                        className="py-1 text-center typography-micro text-muted-foreground"
                      >
                        {weekday}
                      </div>
                    ))}
                  </div>

                  <div className="grid grid-cols-7 gap-1">
                    {getCalendarCells(calendarMonth, weekStartsOn).map(({ date, inCurrentMonth }) => {
                      const isoDate = formatLocalDateISO(date)
                      const isSelected = isoDate === draft.schedule.onceDate
                      const isToday = isSameCalendarDay(date, todayDate)
                      const isPast = date.getTime() < todayDate.getTime()
                      const dayClass = isSelected
                        ? "bg-interactive-selection text-interactive-selection-foreground"
                        : isPast
                          ? "text-muted-foreground"
                          : inCurrentMonth
                            ? "text-foreground hover:bg-interactive-hover"
                            : "text-muted-foreground hover:bg-interactive-hover"
                      return (
                        <button
                          key={isoDate}
                          type="button"
                          onClick={() => {
                            if (isPast) {
                              return
                            }
                            setOneTimeDate(isoDate)
                            setIsDatePickerOpen(false)
                          }}
                          disabled={isPast}
                          className={[
                            "h-8 rounded-md typography-ui-label",
                            dayClass,
                            isToday && !isSelected
                              ? "ring-1 ring-inset ring-interactive-focusRing bg-interactive-hover/50"
                              : "",
                            isPast ? "cursor-not-allowed opacity-45" : "",
                          ].join(" ")}
                        >
                          {date.getDate()}
                        </button>
                      )
                    })}
                  </div>

                  <div className="mt-2 flex items-center justify-between border-t border-border pt-2">
                    <div className="typography-micro text-muted-foreground">{selectedDateLabel || ""}</div>
                    <Button
                      type="button"
                      size="xs"
                      variant="ghost"
                      onClick={() => {
                        setOneTimeDate(formatLocalDateISO(todayDate))
                        setCalendarMonth(new Date(todayDate.getFullYear(), todayDate.getMonth(), 1))
                      }}
                    >
                      {t("sessions.scheduledTasks.editor.date.jumpToToday")}
                    </Button>
                  </div>
                </div>
              ) : null}
            </div>
          </div>

          <div className="flex min-w-0 flex-col gap-1">
            <FieldLabel>{t("sessions.scheduledTasks.editor.time.label")}</FieldLabel>
            <TimePill
              value={draft.schedule.onceTime}
              use24Hour={use24Hour}
              hourAriaLabel={t("sessions.scheduledTasks.editor.time.hourAria")}
              minuteAriaLabel={t("sessions.scheduledTasks.editor.time.minuteAria")}
              periodAriaLabel={t("sessions.scheduledTasks.editor.time.periodAria")}
              amLabel={t("sessions.scheduledTasks.editor.time.period.am")}
              pmLabel={t("sessions.scheduledTasks.editor.time.period.pm")}
              onChange={(next) =>
                setDraft((prev) => ({
                  ...prev,
                  schedule: { ...prev.schedule, onceTime: next },
                }))
              }
            />

            <div className="mt-2 flex flex-col gap-1">
              <FieldLabel>{t("sessions.scheduledTasks.editor.timezone.label")}</FieldLabel>
              <Select
                value={draft.schedule.timezone}
                onValueChange={(timezone) => {
                  setDraft((prev) => ({
                    ...prev,
                    schedule: { ...prev.schedule, timezone },
                  }))
                }}
              >
                <SelectTrigger className="w-fit max-w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {timezoneOptions.map((timezone) => (
                    <SelectItem key={timezone} value={timezone}>
                      {timezone}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-x-4 gap-y-3 sm:grid-cols-2">
          {draft.schedule.kind === "weekly" ? (
            <div className="flex flex-col gap-1 sm:col-span-2">
              <FieldLabel>{t("sessions.scheduledTasks.editor.weekdays.label")}</FieldLabel>
              <div className="flex flex-wrap gap-x-3 gap-y-2">
                {orderedWeekdays.map((weekday) => {
                  const checked = draft.schedule.weekdays.includes(weekday.value)
                  return (
                    <div
                      key={weekday.value}
                      className={[
                        "group inline-flex items-center gap-1.5 px-0.5 py-0.5 typography-meta",
                        checked ? "text-foreground" : "text-muted-foreground",
                      ].join(" ")}
                    >
                      <Checkbox
                        checked={checked}
                        onChange={(next) => toggleWeekday(weekday.value, next)}
                        ariaLabel={weekday.label}
                      />
                      <button
                        type="button"
                        onClick={() => toggleWeekday(weekday.value, !checked)}
                        className="group-hover:text-foreground"
                      >
                        {weekday.label}
                      </button>
                    </div>
                  )
                })}
              </div>
            </div>
          ) : null}

          <div className="flex flex-col gap-2">
            <FieldLabel>{t("sessions.scheduledTasks.editor.times.label")}</FieldLabel>
            <div className="flex flex-col gap-2">
              {draft.schedule.times.map((time, index) => (
                <div key={index} className="flex items-center gap-2">
                  <TimePill
                    value={time}
                    use24Hour={use24Hour}
                    hourAriaLabel={t("sessions.scheduledTasks.editor.time.hourAria")}
                    minuteAriaLabel={t("sessions.scheduledTasks.editor.time.minuteAria")}
                    periodAriaLabel={t("sessions.scheduledTasks.editor.time.periodAria")}
                    amLabel={t("sessions.scheduledTasks.editor.time.period.am")}
                    pmLabel={t("sessions.scheduledTasks.editor.time.period.pm")}
                    onChange={(next) => updateTimeAt(index, next)}
                  />
                  {draft.schedule.times.length > 1 ? (
                    <Button
                      type="button"
                      size="icon"
                      variant="ghost"
                      onClick={() => removeTimeAt(index)}
                      aria-label={t("sessions.scheduledTasks.editor.times.removeAria")}
                    >
                      <Icon name="close" className="h-4 w-4" />
                    </Button>
                  ) : null}
                </div>
              ))}
            </div>
            <div>
              <Button type="button" size="sm" variant="outline" onClick={addTime}>
                <Icon name="add" className="mr-1 h-4 w-4" /> {t("sessions.scheduledTasks.editor.times.add")}
              </Button>
            </div>
          </div>

          <div className="flex flex-col gap-1">
            <FieldLabel>{t("sessions.scheduledTasks.editor.timezone.label")}</FieldLabel>
            <Select
              value={draft.schedule.timezone}
              onValueChange={(timezone) => {
                setDraft((prev) => ({
                  ...prev,
                  schedule: { ...prev.schedule, timezone },
                }))
              }}
            >
              <SelectTrigger className="w-fit max-w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {timezoneOptions.map((timezone) => (
                  <SelectItem key={timezone} value={timezone}>
                    {timezone}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>
      )}

      <div className="grid grid-cols-1 gap-x-4 gap-y-3 sm:grid-cols-2">
        <div className="flex min-w-0 flex-col gap-1">
          <FieldLabel required>{t("sessions.scheduledTasks.editor.model.label")}</FieldLabel>
          <ModelSelector
            providerId={draft.execution.providerID}
            modelId={draft.execution.modelID}
            onChange={(providerID, modelID) => {
              setDraft((prev) => ({
                ...prev,
                execution: {
                  ...prev.execution,
                  providerID,
                  modelID,
                },
              }))
            }}
          />
        </div>

        <div className="flex min-w-0 flex-col gap-1">
          <FieldLabel>{t("sessions.scheduledTasks.editor.agent.label")}</FieldLabel>
          <AgentSelector
            agentName={draft.execution.agent}
            filter={(agent) => isPrimaryMode(agent.mode)}
            onChange={(agent) =>
              setDraft((prev) => ({
                ...prev,
                execution: {
                  ...prev.execution,
                  agent,
                },
              }))
            }
          />
        </div>
      </div>

      <div className="flex flex-col gap-1">
        <FieldLabel htmlFor="sched-prompt" required>
          {t("sessions.scheduledTasks.editor.prompt.label")}
        </FieldLabel>
        <div className="relative">
          <Textarea
            id="sched-prompt"
            ref={promptTextareaRef}
            value={draft.execution.prompt}
            onChange={(event) => {
              const nextPrompt = event.target.value
              setPromptValue(nextPrompt)
              const cursorPosition = event.target.selectionStart ?? nextPrompt.length
              updateAutocompleteState(nextPrompt, cursorPosition)
            }}
            onKeyDown={handlePromptKeyDown}
            rows={8}
            placeholder={t("sessions.scheduledTasks.editor.prompt.placeholder")}
            className="typography-meta min-h-[120px] max-h-[300px] resize-none overflow-y-auto"
          />

          {showCommandAutocomplete ? (
            <CommandAutocomplete
              ref={commandRef}
              searchQuery={commandQuery}
              onCommandSelect={handleCommandSelect}
              onClose={() => setShowCommandAutocomplete(false)}
              style={{
                left: 0,
                top: "auto",
                bottom: "calc(100% + 6px)",
                marginBottom: 0,
                maxWidth: "100%",
              }}
            />
          ) : null}

          {showFileMention ? (
            <FileMentionAutocomplete
              ref={mentionRef}
              searchQuery={mentionQuery}
              onFileSelect={handleFileSelect}
              onAgentSelect={handleAgentSelect}
              onClose={() => setShowFileMention(false)}
              style={{
                left: 0,
                top: "auto",
                bottom: "calc(100% + 6px)",
                marginBottom: 0,
                maxWidth: "100%",
              }}
            />
          ) : null}

          {showSnippetAutocomplete ? (
            <SnippetAutocomplete
              ref={snippetRef}
              searchQuery={snippetQuery}
              onSnippetSelect={handleSnippetSelect}
              onClose={() => setShowSnippetAutocomplete(false)}
              style={{
                left: 0,
                top: "auto",
                bottom: "calc(100% + 6px)",
                marginBottom: 0,
                maxWidth: "100%",
              }}
            />
          ) : null}
        </div>
      </div>
    </div>
  )

  const footerRow = (
    <div className="flex items-center justify-between gap-3">
      <label className="inline-flex items-center gap-2">
        <Checkbox
          checked={draft.enabled}
          onChange={(enabled) => setDraft((prev) => ({ ...prev, enabled }))}
          ariaLabel={t("sessions.scheduledTasks.editor.enabled.aria")}
        />
        <span className="typography-meta">{t("sessions.scheduledTasks.editor.enabled.label")}</span>
      </label>

      <div className="flex items-center gap-2">
        <Button type="button" variant="ghost" size="sm" onClick={() => onOpenChange(false)} disabled={saving}>
          {t("sessions.scheduledTasks.editor.actions.cancel")}
        </Button>
        <Button type="button" size="sm" onClick={handleSubmit} disabled={saving}>
          {saving
            ? t("sessions.scheduledTasks.editor.actions.saving")
            : t("sessions.scheduledTasks.editor.actions.save")}
        </Button>
      </div>
    </div>
  )

  if (isMobile) {
    return (
      <MobileOverlayPanel
        open={open}
        title={title}
        onClose={() => onOpenChange(false)}
        contentMaxHeightClassName="max-h-[min(80vh,640px)]"
        renderHeader={(closeButton) => (
          <div className="flex flex-col gap-1 border-b border-border/40 px-3 py-2">
            <div className="flex items-center justify-between gap-2">
              <h2 className="typography-ui-label font-semibold text-foreground">{title}</h2>
              {closeButton}
            </div>
            <p className="typography-micro text-muted-foreground">{description}</p>
            {projectLine}
          </div>
        )}
        footer={footerRow}
      >
        {formBody}
      </MobileOverlayPanel>
    )
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (!next && hasOpenFloatingMenu()) {
          return
        }
        onOpenChange(next)
      }}
    >
      <DialogContent
        aria-describedby={descriptionId}
        className="!max-w-[720px] w-[90vw] h-[680px] max-h-[85vh] gap-0 p-0 overflow-hidden"
      >
        <DialogDescription id={descriptionId} className="sr-only">
          {description}
        </DialogDescription>

        <header className="shrink-0 px-4 sm:px-6 pt-5 pb-3">
          <div className="mx-auto w-full max-w-2xl">
            <DialogTitle className="typography-ui-label font-medium text-foreground">{title}</DialogTitle>
            <p className="typography-meta mt-0.5 text-muted-foreground">{description}</p>
            {projectLine}
          </div>
        </header>

        <ScrollShadow
          className="flex-1 min-h-0 overflow-auto [scrollbar-gutter:stable_both-edges]"
          size={64}
          hideTopShadow
        >
          <div className="mx-auto w-full max-w-2xl px-4 sm:px-6 pb-5">{formBody}</div>
        </ScrollShadow>

        <div className="shrink-0 px-4 sm:px-6 py-3">
          <div className="mx-auto w-full max-w-2xl">{footerRow}</div>
        </div>
      </DialogContent>
    </Dialog>
  )
}
