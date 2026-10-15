import type {
  ScheduledTask,
  ScheduledTaskFamilyReconciliation,
  ScheduledTaskRunDisplayStatus,
} from "@/lib/scheduledTasksApi"
import type { RuntimeSchedule, RuntimeTaskPayload, RuntimeTaskStatus } from "@/lib/scheduledTaskTransform"
import { truncateToCodeUnits } from "@/lib/textTruncate"
import { buildTaskRowKey, normalizeDirectory } from "./scheduledTaskGroups"

/**
 * The runtime scheduler supports one time (daily) or one weekday+time
 * (weekly) per task, so the editor's multi-time draft is fanned out into N
 * runtime tasks titled "<name> (i/N)" (scheduledTaskTransform.ts; the S2.6
 * migration uses the same rule). This module folds those parts back into one
 * "family" so the dialog shows and manages them as the single task the user
 * created.
 */

export type FanOutTitle = {
  base: string
  index: number
  total: number
}

const FAN_OUT_TITLE_PATTERN = /^(.*) \((\d+)\/(\d+)\)$/

export const parseFanOutTitle = (title: string): FanOutTitle | null => {
  const match = FAN_OUT_TITLE_PATTERN.exec(title)
  if (!match) return null
  const base = match[1]
  const index = Number(match[2])
  const total = Number(match[3])
  // The fan-out only suffixes when there is more than one part.
  if (!base.trim() || index < 1 || total < 2 || index > total) return null
  return { base, index, total }
}

export type ScheduledTaskFamilyStatus = RuntimeTaskStatus | "mixed"

export type ScheduledTaskFamily = {
  /** Stable key within a directory: the primary member's id. */
  key: string
  directory: string
  /** Base title without the " (i/N)" suffix. */
  title: string
  /** Members sorted by fan-out index, then schedule. */
  members: ScheduledTask[]
  primary: ScheduledTask
  status: ScheduledTaskFamilyStatus
  /** True when at least one member is active; drives the row toggle. */
  anyActive: boolean
  /** Earliest next run among active members. */
  nextRunAt?: number
  lastRunAt?: number
  lastRunStatus: ScheduledTaskRunDisplayStatus
  lastError?: string
}

const scheduleTimezone = (schedule: RuntimeSchedule): string =>
  "timezone" in schedule && schedule.timezone ? schedule.timezone : ""

const modelKey = (task: ScheduledTask): string => (task.model ? `${task.model.providerID}/${task.model.modelID}` : "")

// Parts of one fan-out share everything but the schedule slot. Keying on the
// rest keeps a user-named "Foo (1/2)" with a different prompt, or a sibling
// edited into a different model, from being folded into the wrong family.
const fanOutFamilyKey = (task: ScheduledTask, base: string, total: number): string =>
  JSON.stringify([
    "fan",
    normalizeDirectory(task.directory),
    base,
    total,
    task.prompt,
    task.schedule.type,
    scheduleTimezone(task.schedule),
    task.agent ?? "",
    modelKey(task),
    task.catchUpPolicy,
  ])

const scheduleSortKey = (schedule: RuntimeSchedule): string => {
  if (schedule.type === "daily") return `0|${schedule.time}`
  if (schedule.type === "weekly") return `1|${schedule.day}|${schedule.time}`
  if (schedule.type === "once") return `2|${String(schedule.runAt).padStart(15, "0")}`
  return `3|${schedule.expression}`
}

const compareMembers = (a: ScheduledTask, b: ScheduledTask): number => {
  const aIndex = parseFanOutTitle(a.title)?.index ?? 0
  const bIndex = parseFanOutTitle(b.title)?.index ?? 0
  if (aIndex !== bIndex) return aIndex - bIndex
  const bySchedule = scheduleSortKey(a.schedule).localeCompare(scheduleSortKey(b.schedule))
  if (bySchedule !== 0) return bySchedule
  return a.id.localeCompare(b.id)
}

const aggregateStatus = (members: readonly ScheduledTask[]): ScheduledTaskFamilyStatus => {
  const first = members[0].status
  return members.every((member) => member.status === first) ? first : "mixed"
}

const maxDefined = (values: Array<number | undefined>): number | undefined => {
  let result: number | undefined
  for (const value of values) {
    if (typeof value === "number" && Number.isFinite(value) && (result === undefined || value > result)) result = value
  }
  return result
}

const minDefined = (values: Array<number | undefined>): number | undefined => {
  let result: number | undefined
  for (const value of values) {
    if (typeof value === "number" && Number.isFinite(value) && (result === undefined || value < result)) result = value
  }
  return result
}

// Running wins (a part is delivering now); otherwise the family reports what
// its most recently run part reported, error text included, so one old
// failure does not keep the row red after a later part succeeded.
const aggregateLastRun = (
  members: readonly ScheduledTask[],
): { lastRunStatus: ScheduledTaskRunDisplayStatus; lastError?: string } => {
  if (members.some((member) => member.lastRunStatus === "running")) return { lastRunStatus: "running" }
  const latest = [...members]
    .filter((member) => typeof member.lastRunAt === "number")
    .sort((a, b) => (b.lastRunAt ?? 0) - (a.lastRunAt ?? 0))[0]
  if (!latest) return { lastRunStatus: "idle" }
  return {
    lastRunStatus: latest.lastRunStatus,
    ...(latest.lastRunStatus === "error" && latest.lastError ? { lastError: latest.lastError } : {}),
  }
}

const buildFamily = (title: string, members: ScheduledTask[]): ScheduledTaskFamily => {
  const sorted = [...members].sort(compareMembers)
  const primary = sorted[0]
  const directory = normalizeDirectory(primary.directory)
  const nextRunAt = minDefined(sorted.filter((member) => member.status === "active").map((member) => member.nextRunAt))
  return {
    key: buildTaskRowKey(directory, primary.id),
    directory,
    title,
    members: sorted,
    primary,
    status: aggregateStatus(sorted),
    anyActive: sorted.some((member) => member.status === "active"),
    ...(nextRunAt !== undefined ? { nextRunAt } : {}),
    ...(maxDefined(sorted.map((member) => member.lastRunAt)) !== undefined
      ? { lastRunAt: maxDefined(sorted.map((member) => member.lastRunAt)) }
      : {}),
    ...aggregateLastRun(sorted),
  }
}

// There is no stored family id, so folding is a heuristic and bulk actions
// (pause, delete, re-save) must fail toward splitting, never merging. A bucket
// is a family only when it is exactly the set the fan-out produced: daily or
// weekly parts with one shared total and the indices 1..N each present once.
const isCompleteFanOut = (members: readonly ScheduledTask[]): boolean => {
  if (members.length < 2) return false
  const type = members[0].schedule.type
  if (type !== "daily" && type !== "weekly") return false
  const parsed = members.map((member) => parseFanOutTitle(member.title))
  const total = parsed[0]?.total
  if (!total || total !== members.length) return false
  const seen = new Set<number>()
  for (const part of parsed) {
    if (!part || part.total !== total || seen.has(part.index)) return false
    seen.add(part.index)
  }
  return true
}

/**
 * Fold one directory's tasks into families. Parts with a " (i/N)" title join
 * the family of their siblings when together they form the complete fan-out
 * set; every other task (including a stray or duplicate part) is a family of
 * one under its full title. Families come back in first-appearance order;
 * sort them with sortScheduledTaskFamilies for display.
 */
export const groupScheduledTaskFamilies = (tasks: readonly ScheduledTask[]): ScheduledTaskFamily[] => {
  const buckets = new Map<string, { title: string; members: ScheduledTask[] }>()
  for (const task of tasks) {
    const parsed = parseFanOutTitle(task.title)
    const key = parsed ? fanOutFamilyKey(task, parsed.base, parsed.total) : `single:${task.id}`
    const bucket = buckets.get(key)
    if (bucket) {
      bucket.members.push(task)
    } else {
      buckets.set(key, { title: parsed ? parsed.base : task.title, members: [task] })
    }
  }
  const families: ScheduledTaskFamily[] = []
  for (const bucket of buckets.values()) {
    if (bucket.members.length === 1 || isCompleteFanOut(bucket.members)) {
      const [only] = bucket.members
      families.push(buildFamily(bucket.members.length === 1 ? only.title : bucket.title, bucket.members))
    } else {
      for (const member of bucket.members) families.push(buildFamily(member.title, [member]))
    }
  }
  return families
}

/**
 * Same order as the per-task list: families with an active part first, then
 * title, then next run.
 */
export const sortScheduledTaskFamilies = (families: readonly ScheduledTaskFamily[]): ScheduledTaskFamily[] =>
  [...families].sort((a, b) => {
    const aActive = a.anyActive
    const bActive = b.anyActive
    if (aActive !== bActive) return aActive ? -1 : 1
    const byName = a.title.localeCompare(b.title)
    if (byName !== 0) return byName
    return (a.nextRunAt || Number.MAX_SAFE_INTEGER) - (b.nextRunAt || Number.MAX_SAFE_INTEGER)
  })

export type FamilyScheduleDescription = {
  type: RuntimeSchedule["type"]
  /** Sorted unique "HH:MM" values across members (daily/weekly). */
  times: string[]
  /** Sorted unique weekdays across members (weekly). */
  weekdays: number[]
  timezone?: string
  /**
   * True when the family is exactly the weekdays × times grid (or a single
   * schedule), so "Daily 09:00, 13:00" describes it fully. False means the
   * members must be listed one by one.
   */
  compact: boolean
}

const uniqueSorted = <T extends string | number>(values: T[]): T[] =>
  Array.from(new Set(values)).sort((a, b) =>
    typeof a === "number" ? a - (b as number) : String(a).localeCompare(String(b)),
  )

export const describeFamilySchedule = (family: ScheduledTaskFamily): FamilyScheduleDescription => {
  const { members, primary } = family
  const type = primary.schedule.type
  const timezone = scheduleTimezone(primary.schedule) || undefined
  const sameType = members.every((member) => member.schedule.type === type)
  if (!sameType) return { type, times: [], weekdays: [], ...(timezone ? { timezone } : {}), compact: false }

  if (type === "daily") {
    const times = uniqueSorted(
      members.map((member) => (member.schedule.type === "daily" ? member.schedule.time : "")).filter(Boolean),
    )
    return { type, times, weekdays: [], ...(timezone ? { timezone } : {}), compact: times.length === members.length }
  }
  if (type === "weekly") {
    const slots = members.flatMap((member) =>
      member.schedule.type === "weekly" ? [{ day: member.schedule.day, time: member.schedule.time }] : [],
    )
    const times = uniqueSorted(slots.map((slot) => slot.time))
    const weekdays = uniqueSorted(slots.map((slot) => slot.day))
    const present = new Set(slots.map((slot) => `${slot.day}|${slot.time}`))
    const compact =
      present.size === members.length &&
      present.size === weekdays.length * times.length &&
      weekdays.every((day) => times.every((time) => present.has(`${day}|${time}`)))
    return { type, times, weekdays, ...(timezone ? { timezone } : {}), compact }
  }
  return { type, times: [], weekdays: [], ...(timezone ? { timezone } : {}), compact: members.length === 1 }
}

const sameSchedule = (a: RuntimeSchedule, b: RuntimeSchedule): boolean =>
  scheduleSortKey(a) === scheduleSortKey(b) && scheduleTimezone(a) === scheduleTimezone(b)

const sameModel = (a: ScheduledTask["model"], b: RuntimeTaskPayload["model"]): boolean =>
  (a?.providerID ?? "") === (b?.providerID ?? "") && (a?.modelID ?? "") === (b?.modelID ?? "")

const payloadMatchesMember = (member: ScheduledTask, payload: RuntimeTaskPayload): boolean =>
  member.title === payload.title &&
  member.prompt === payload.prompt &&
  sameSchedule(member.schedule, payload.schedule) &&
  (member.agent ?? "") === (payload.agent ?? "") &&
  sameModel(member.model, payload.model) &&
  member.catchUpPolicy === payload.catchUpPolicy

// `status` null means the editor's enabled switch was not touched: kept parts
// keep their own status and new parts follow the primary part.
const resolveStatus = (member: ScheduledTask, status: RuntimeTaskStatus | null): RuntimeTaskStatus | undefined =>
  status !== null && member.status !== status && member.status !== "disabled" ? status : undefined

// New parts follow the family as the row shows it: enabled while any part is
// active (the row toggle and the editor switch both read `anyActive`).
const createStatusFor = (members: readonly ScheduledTask[], status: RuntimeTaskStatus | null): RuntimeTaskStatus => {
  if (status !== null) return status
  return members.some((member) => member.status === "active") || members.length === 0 ? "active" : "paused"
}

/**
 * Fields of a re-saved draft that every part of a family shares. `title` is
 * the base name; each part keeps its own " (i/N)" suffix.
 */
export type FamilySharedFields = Pick<RuntimeTaskPayload, "title" | "prompt" | "agent" | "model" | "catchUpPolicy">

// Mirrors slotTitle in scheduledTaskTransform.ts, including the runtime's
// title length cap.
const MAX_RUNTIME_TITLE_LENGTH = 200

const retitleMember = (currentTitle: string, base: string): string => {
  const parsed = parseFanOutTitle(currentTitle)
  const next = parsed ? `${base} (${parsed.index}/${parsed.total})` : base
  return truncateToCodeUnits(next, MAX_RUNTIME_TITLE_LENGTH, "")
}

/**
 * Re-save that leaves every part's schedule (and title numbering) alone and
 * only writes the shared fields: used for families whose schedule is not the
 * weekday × time grid the editor can express, so a prompt edit never
 * rewrites their slots.
 */
const updateFor = (
  member: ScheduledTask,
  payload: RuntimeTaskPayload,
  status: RuntimeTaskStatus | null,
): ScheduledTaskFamilyReconciliation["updates"] => {
  const nextStatus = resolveStatus(member, status)
  if (nextStatus === undefined && payloadMatchesMember(member, payload)) return []
  return [
    {
      id: member.id,
      payload,
      ...(nextStatus ? { status: nextStatus } : {}),
      ...(member.model && !payload.model ? { clearModel: true } : {}),
    },
  ]
}

export const planFamilyFieldUpdate = (
  members: readonly ScheduledTask[],
  fields: FamilySharedFields,
  status: RuntimeTaskStatus | null,
): ScheduledTaskFamilyReconciliation => ({
  updates: members.flatMap((member) =>
    updateFor(
      member,
      { ...fields, title: retitleMember(member.title, fields.title), schedule: member.schedule },
      status,
    ),
  ),
  creates: [],
  createStatus: createStatusFor(members, status),
  deletes: [],
})

/**
 * Pair the family's current members with the payloads of a re-saved draft:
 * first by identical schedule (so an untouched slot keeps its id, run history
 * and next-run time), then by position; extra slots become new parts and
 * surplus parts are deleted (last, so a failure part-way never loses data
 * before the new parts exist). Members whose fields and status already match
 * are left alone.
 */
export const planFamilyReconciliation = (
  members: readonly ScheduledTask[],
  payloads: readonly RuntimeTaskPayload[],
  status: RuntimeTaskStatus | null,
): ScheduledTaskFamilyReconciliation => {
  const remaining = [...members].sort(compareMembers)
  const pairs: Array<{ member: ScheduledTask; payload: RuntimeTaskPayload }> = []
  const unpaired: RuntimeTaskPayload[] = []
  for (const payload of payloads) {
    const index = remaining.findIndex((member) => sameSchedule(member.schedule, payload.schedule))
    if (index === -1) {
      unpaired.push(payload)
      continue
    }
    pairs.push({ member: remaining[index], payload })
    remaining.splice(index, 1)
  }
  const creates: RuntimeTaskPayload[] = []
  for (const payload of unpaired) {
    const member = remaining.shift()
    if (member) {
      pairs.push({ member, payload })
    } else {
      creates.push(payload)
    }
  }
  return {
    updates: pairs.flatMap(({ member, payload }) => updateFor(member, payload, status)),
    creates,
    createStatus: createStatusFor(members, status),
    deletes: remaining.map((member) => member.id),
  }
}

export const familyMemberIDs = (family: ScheduledTaskFamily): string[] => family.members.map((member) => member.id)

/**
 * Resolve the parts a re-save applies to: the members the editor opened with
 * (in that order) plus any stray part that a previous, partly failed save
 * already created — same base title and the schedule slot of one of the new
 * payloads — so saving again updates it instead of creating a duplicate.
 * `missing` lists opened members that no longer exist; callers fail closed
 * on it because planning from a partial set would duplicate live parts.
 */
export const resolveFamilyMembers = (
  tasks: readonly ScheduledTask[],
  memberIDs: readonly string[],
  options: { baseTitles: readonly string[]; schedules: readonly RuntimeSchedule[] },
): { members: ScheduledTask[]; missing: string[] } => {
  const byID = new Map(tasks.map((task) => [task.id, task]))
  const members: ScheduledTask[] = []
  const missing: string[] = []
  const seen = new Set<string>()
  for (const id of memberIDs) {
    if (seen.has(id)) continue
    seen.add(id)
    const task = byID.get(id)
    if (task) {
      members.push(task)
    } else {
      missing.push(id)
    }
  }
  const bases = new Set(options.baseTitles.filter((title) => title.trim().length > 0))
  for (const task of tasks) {
    if (seen.has(task.id)) continue
    const base = parseFanOutTitle(task.title)?.base ?? task.title
    if (!bases.has(base)) continue
    if (!options.schedules.some((schedule) => sameSchedule(schedule, task.schedule))) continue
    seen.add(task.id)
    members.push(task)
  }
  return { members, missing }
}
