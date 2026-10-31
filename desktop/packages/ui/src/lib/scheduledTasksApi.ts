import { axCodeClient } from "@/lib/ax-code/client"
import { API_ENDPOINTS, HTTP_DEFAULTS } from "@/lib/http"
import { ScheduledTaskRejectedError } from "@/lib/scheduledTaskErrors"
import type {
  CatchUpPolicy,
  RuntimeModelRef,
  RuntimeSchedule,
  RuntimeTaskPayload,
  RuntimeTaskStatus,
} from "@/lib/scheduledTaskTransform"

// S2.6 (SPEC-2026-08-29-desktop-process-model-collapse §2 D6): this module
// talks to the ax-code runtime `/scheduled-task` routes (via the SDK, with
// `directory` = the project path). The retired desktop endpoints under
// `/api/projects/:projectId/scheduled-tasks` are gone.

export type ScheduledTaskRunDisplayStatus = "idle" | "running" | "success" | "error" | "unknown"

export type ScheduledTask = {
  id: string
  directory: string
  title: string
  prompt: string
  schedule: RuntimeSchedule
  status: RuntimeTaskStatus
  agent?: string
  model?: RuntimeModelRef
  catchUpPolicy: CatchUpPolicy
  nextRunAt?: number
  lastRunAt?: number
  /** Latest run outcome, derived from `GET /scheduled-task/:id/runs` (limit 1). */
  lastRunStatus: ScheduledTaskRunDisplayStatus
  lastError?: string
  time: {
    created: number
    updated?: number
  }
}

type RuntimeTaskInfo = {
  id: string
  directory: string
  title: string
  prompt: string
  schedule: RuntimeSchedule
  status: RuntimeTaskStatus
  agent?: string
  model?: unknown
  catchUpPolicy: CatchUpPolicy
  nextRunAt?: number
  lastRunAt?: number
  error?: string
  time: { created: number; updated?: number }
}

type RuntimeRunInfo = {
  status: "running" | "completed" | "failed" | "timeout" | "skipped_overlap" | "missed_skip"
  error?: string
  timeCompleted?: number
  time: { created: number }
}

/** One entry of `GET /scheduled-task/:id/runs`, as the run history dialog shows it. */
export type ScheduledTaskRun = {
  id: string
  taskID: string
  triggerType: "scheduled" | "manual"
  status: RuntimeRunInfo["status"]
  occurrenceAt?: number
  coalescedCount: number
  error?: string
  timeStarted?: number
  timeCompleted?: number
  time: { created: number; updated?: number }
}

/**
 * What re-saving a fanned-out task (see components/session/scheduledTaskFamilies)
 * has to do to the runtime: in-place updates for kept parts, new parts for
 * extra slots, and the surplus parts to delete afterwards.
 */
export type ScheduledTaskFamilyReconciliation = {
  /**
   * Kept parts to rewrite; `status` is present only when it has to change,
   * `clearModel` when the part had a model the draft no longer sets, and
   * `keepSchedule` when the part's schedule is unchanged, so the update leaves
   * it out and the runtime neither re-validates nor re-arms it.
   */
  updates: Array<{
    id: string
    payload: RuntimeTaskPayload
    status?: RuntimeTaskStatus
    clearModel?: boolean
    keepSchedule?: boolean
  }>
  creates: RuntimeTaskPayload[]
  /** Status every created part ends up in (the runtime creates them active). */
  createStatus: RuntimeTaskStatus
  /** Surplus parts, deleted after updates and creates succeeded. */
  deletes: string[]
}

const RUN_FETCH_CONCURRENCY = 6

const formatSdkError = (error: unknown, fallback: string): string => {
  if (error instanceof Error && error.message) return error.message
  if (typeof error === "string" && error.trim()) return error
  if (error && typeof error === "object") {
    const record = error as { message?: unknown; error?: unknown }
    if (typeof record.message === "string" && record.message.trim()) return record.message
    if (typeof record.error === "string" && record.error.trim()) return record.error
    if (record.error && typeof record.error === "object") {
      const nested = (record.error as { message?: unknown }).message
      if (typeof nested === "string" && nested.trim()) return nested
    }
  }
  return fallback
}

const ensureDirectory = (directory: string): string => {
  const trimmed = typeof directory === "string" ? directory.trim() : ""
  if (!trimmed) {
    throw new Error("directory is required")
  }
  return trimmed
}

const clientFor = (directory: string) => axCodeClient.getScopedApiClient(ensureDirectory(directory))

// The SDK returns `{ error, response }` for an HTTP error and `{ error }` with no
// response when the request itself failed. A 4xx means the runtime refused the
// payload before it stored anything; everything else leaves the outcome open.
const isDefinitiveRejection = (response: Response | undefined): boolean =>
  typeof response?.status === "number" && response.status >= 400 && response.status < 500

const toModelRef = (model: unknown): RuntimeModelRef | undefined => {
  if (!model || typeof model !== "object") return undefined
  const record = model as { providerID?: unknown; modelID?: unknown }
  if (typeof record.providerID !== "string" || typeof record.modelID !== "string") return undefined
  return { providerID: record.providerID, modelID: record.modelID }
}

const toScheduledTask = (info: RuntimeTaskInfo): ScheduledTask => ({
  id: info.id,
  directory: info.directory,
  title: info.title,
  prompt: info.prompt,
  schedule: info.schedule,
  status: info.status,
  ...(info.agent ? { agent: info.agent } : {}),
  ...(toModelRef(info.model) ? { model: toModelRef(info.model) } : {}),
  catchUpPolicy: info.catchUpPolicy === "skip" ? "skip" : "run_once",
  ...(typeof info.nextRunAt === "number" ? { nextRunAt: info.nextRunAt } : {}),
  ...(typeof info.lastRunAt === "number" ? { lastRunAt: info.lastRunAt } : {}),
  lastRunStatus: typeof info.lastRunAt === "number" ? "unknown" : info.error ? "error" : "idle",
  ...(info.error ? { lastError: info.error } : {}),
  time: info.time,
})

const runDisplayStatus = (run: RuntimeRunInfo): ScheduledTaskRunDisplayStatus => {
  if (run.status === "running") return "running"
  if (run.status === "completed") return "success"
  if (run.status === "failed" || run.status === "timeout") return "error"
  return "idle"
}

const mapWithConcurrency = async <T, R>(items: T[], concurrency: number, fn: (item: T) => Promise<R>): Promise<R[]> => {
  const results: R[] = new Array(items.length)
  let index = 0
  const worker = async () => {
    while (index < items.length) {
      const current = index
      index += 1
      results[current] = await fn(items[current])
    }
  }
  const workers = []
  for (let i = 0; i < Math.min(concurrency, items.length); i += 1) {
    workers.push(worker())
  }
  await Promise.all(workers)
  return results
}

const withLatestRun = async (directory: string, task: ScheduledTask): Promise<ScheduledTask> => {
  const unavailable = (): ScheduledTask => ({ ...task, lastRunStatus: "unknown", lastError: undefined })
  try {
    const response = await clientFor(directory).scheduledTask.listRuns({ scheduledTaskID: task.id, limit: 1 })
    if (response.error || !Array.isArray(response.data)) return unavailable()
    if (response.data.length === 0) return task.lastRunStatus === "idle" ? task : unavailable()
    const latest = toScheduledTaskRun(response.data[0], task.id)
    if (!latest) return unavailable()
    return {
      ...task,
      lastRunStatus: runDisplayStatus(latest),
      lastError: latest.error || undefined,
    }
  } catch {
    // Run history is display-only; keep the list row usable without it.
    return unavailable()
  }
}

/**
 * Pre-expand `#snippet` references in a prompt before it is stored in the
 * runtime. The retired desktop engine expanded snippets at run time; the
 * runtime scheduler stores and executes the prompt verbatim, so expansion
 * must happen at save time (same semantics as the S2.6 migration). Failures
 * fall back to the raw prompt — blocking task creation on a snippet-endpoint
 * hiccup is worse than storing one unexpanded reference.
 */
export const expandPromptSnippets = async (directory: string, prompt: string): Promise<string> => {
  if (!/#[a-z0-9_-]+/i.test(prompt)) return prompt
  try {
    const safeDirectory = ensureDirectory(directory)
    const response = await fetch(
      `${API_ENDPOINTS.config.snippetExpand}?directory=${encodeURIComponent(safeDirectory)}`,
      {
        method: HTTP_DEFAULTS.method.post,
        headers: {
          ...HTTP_DEFAULTS.headers.acceptAndContentTypeJson,
          "x-ax-code-directory": safeDirectory,
        },
        body: JSON.stringify({ text: prompt }),
      },
    )
    if (!response.ok) {
      response.body?.cancel()
      return prompt
    }
    const parsed = (await response.json().catch(() => null)) as { text?: unknown } | null
    return typeof parsed?.text === "string" && parsed.text.trim().length > 0 ? parsed.text : prompt
  } catch {
    return prompt
  }
}

export const fetchScheduledTasks = async (directory: string): Promise<ScheduledTask[]> => {
  const client = clientFor(directory)
  const response = await client.scheduledTask.list()
  if (response.error) {
    throw new Error(formatSdkError(response.error, "Failed to load scheduled tasks"))
  }
  const infos = (Array.isArray(response.data) ? response.data : []) as RuntimeTaskInfo[]
  const tasks = infos.map(toScheduledTask)
  return mapWithConcurrency(tasks, RUN_FETCH_CONCURRENCY, (task) => withLatestRun(directory, task))
}

const isRunStatus = (value: unknown): value is ScheduledTaskRun["status"] =>
  value === "running" ||
  value === "completed" ||
  value === "failed" ||
  value === "timeout" ||
  value === "skipped_overlap" ||
  value === "missed_skip"

const toScheduledTaskRun = (value: unknown, taskID: string): ScheduledTaskRun | null => {
  if (!value || typeof value !== "object") return null
  const record = value as Record<string, unknown>
  const time = record.time as { created?: unknown; updated?: unknown } | undefined
  if (
    typeof record.id !== "string" ||
    !record.id.trim() ||
    !isRunStatus(record.status) ||
    typeof time?.created !== "number" ||
    !Number.isFinite(time.created) ||
    !Number.isFinite(new Date(time.created).getTime()) ||
    (record.taskID !== undefined && record.taskID !== taskID)
  )
    return null
  const optionalNumber = (field: unknown) => (typeof field === "number" && Number.isFinite(field) ? field : undefined)
  const occurrenceAt = optionalNumber(record.occurrenceAt)
  const timeStarted = optionalNumber(record.timeStarted)
  const timeCompleted = optionalNumber(record.timeCompleted)
  const updated = optionalNumber(time.updated)
  return {
    id: record.id,
    taskID: typeof record.taskID === "string" ? record.taskID : taskID,
    triggerType: record.triggerType === "manual" ? "manual" : "scheduled",
    status: record.status,
    ...(occurrenceAt !== undefined ? { occurrenceAt } : {}),
    coalescedCount: optionalNumber(record.coalescedCount) ?? 0,
    ...(typeof record.error === "string" && record.error.trim() ? { error: record.error } : {}),
    ...(timeStarted !== undefined ? { timeStarted } : {}),
    ...(timeCompleted !== undefined ? { timeCompleted } : {}),
    time: { created: time.created, ...(updated !== undefined ? { updated } : {}) },
  }
}

/**
 * Run history of every given task (a fan-out family has one task per slot).
 * Unlike the list's latest-run lookup this throws: the history dialog has
 * nothing else to show and reports the failure instead.
 */
export const fetchScheduledTaskRuns = async (
  directory: string,
  taskIDs: readonly string[],
  limit: number,
): Promise<ScheduledTaskRun[]> => {
  const client = clientFor(directory)
  const perTask = await mapWithConcurrency([...taskIDs], RUN_FETCH_CONCURRENCY, async (taskID) => {
    const response = await client.scheduledTask.listRuns({ scheduledTaskID: taskID, limit })
    if (response.error || !Array.isArray(response.data)) {
      throw new Error(formatSdkError(response.error, "Failed to load run history"))
    }
    return response.data.map((run) => {
      const parsed = toScheduledTaskRun(run, taskID)
      // Dropping an invalid record would turn incomplete evidence into an empty
      // history or an apparently complete success summary.
      if (!parsed) throw new Error("Failed to load run history")
      return parsed
    })
  })
  return perTask.flat()
}

/**
 * Create the payloads produced by buildRuntimeScheduledTaskPayloads. When
 * `pause` is set (the editor's enabled checkbox was off), each task is paused
 * right after creation — the runtime create route always starts tasks active.
 * A payload the runtime refuses outright throws ScheduledTaskRejectedError;
 * any other failure throws a plain Error, as its outcome is not known.
 */
export const createScheduledTasks = async (
  directory: string,
  payloads: RuntimeTaskPayload[],
  options?: { pause?: boolean; onCreated?: (taskID: string) => void },
): Promise<void> => {
  const client = clientFor(directory)
  for (const payload of payloads) {
    const response = await client.scheduledTask.create(payload)
    if (response.error || !response.data) {
      const message = formatSdkError(response.error, "Failed to save scheduled task")
      if (response.error && isDefinitiveRejection(response.response)) {
        throw new ScheduledTaskRejectedError(message)
      }
      throw new Error(message)
    }
    const created = response.data as RuntimeTaskInfo
    if (typeof created.id !== "string" || !created.id) {
      throw new Error("Scheduled task creation returned no task identity")
    }
    options?.onCreated?.(created.id)
    if (options?.pause) {
      const paused = await client.scheduledTask.pause({ scheduledTaskID: created.id })
      if (paused.error) {
        throw new Error(formatSdkError(paused.error, "Task was created but could not be paused"))
      }
    }
  }
}

export const updateScheduledTask = async (
  directory: string,
  taskID: string,
  patch: {
    title?: string
    prompt?: string
    schedule?: RuntimeSchedule
    status?: RuntimeTaskStatus
    agent?: string
    model?: RuntimeModelRef
    catchUpPolicy?: CatchUpPolicy
  },
): Promise<void> => {
  const client = clientFor(directory)
  const response = await client.scheduledTask.update({ scheduledTaskID: taskID, ...patch })
  if (response.error) {
    throw new Error(formatSdkError(response.error, "Failed to save scheduled task"))
  }
}

/**
 * Apply a family re-save: kept parts first, then new parts, then the surplus
 * parts, so a failure part-way never removes a schedule before its
 * replacement exists. The first error aborts and is thrown; callers reload
 * the directory so the list shows the runtime's actual state. The runtime
 * update route cannot clear an agent (it only accepts a string), so a part
 * keeps its agent when the draft drops it; a dropped model is sent as null.
 * An unchanged schedule is left out of the update: the runtime re-validates
 * every schedule it receives, which rejected a prompt edit on a one-time task
 * whose run time had passed, and re-arms the next run, which dropped a failure
 * backoff.
 */
export const reconcileScheduledTaskFamily = async (
  directory: string,
  plan: ScheduledTaskFamilyReconciliation,
): Promise<void> => {
  const client = clientFor(directory)
  for (const update of plan.updates) {
    const { payload } = update
    const response = await client.scheduledTask.update({
      scheduledTaskID: update.id,
      title: payload.title,
      prompt: payload.prompt,
      ...(update.keepSchedule ? {} : { schedule: payload.schedule }),
      ...(payload.agent ? { agent: payload.agent } : {}),
      ...(payload.model ? { model: payload.model } : update.clearModel ? { model: null } : {}),
      catchUpPolicy: payload.catchUpPolicy,
      ...(update.status ? { status: update.status } : {}),
    })
    if (response.error) {
      throw new Error(formatSdkError(response.error, "Failed to save scheduled task"))
    }
  }
  if (plan.creates.length > 0) {
    await createScheduledTasks(directory, plan.creates, { pause: plan.createStatus === "paused" })
  }
  for (const taskID of plan.deletes) {
    await deleteScheduledTask(directory, taskID)
  }
}

/** Pause or resume every part of a family in order; the first error aborts and is thrown. */
export const setScheduledTasksEnabled = async (
  directory: string,
  taskIDs: readonly string[],
  enabled: boolean,
): Promise<void> => {
  for (const taskID of taskIDs) {
    await setScheduledTaskEnabled(directory, taskID, enabled)
  }
}

/** Delete every part of a family in order; the first error aborts and is thrown. */
export const deleteScheduledTasks = async (directory: string, taskIDs: readonly string[]): Promise<void> => {
  for (const taskID of taskIDs) {
    await deleteScheduledTask(directory, taskID)
  }
}

export const setScheduledTaskEnabled = async (directory: string, taskID: string, enabled: boolean): Promise<void> => {
  const client = clientFor(directory)
  const response = enabled
    ? await client.scheduledTask.resume({ scheduledTaskID: taskID })
    : await client.scheduledTask.pause({ scheduledTaskID: taskID })
  if (response.error) {
    throw new Error(formatSdkError(response.error, "Failed to update scheduled task"))
  }
}

export const deleteScheduledTask = async (directory: string, taskID: string): Promise<void> => {
  const client = clientFor(directory)
  const response = await client.scheduledTask.delete({ scheduledTaskID: taskID })
  if (response.error) {
    throw new Error(formatSdkError(response.error, "Failed to delete scheduled task"))
  }
}

export const runScheduledTaskNow = async (directory: string, taskID: string): Promise<void> => {
  const client = clientFor(directory)
  const response = await client.scheduledTask.runNow({ scheduledTaskID: taskID })
  if (response.error) {
    throw new Error(formatSdkError(response.error, "Failed to run scheduled task"))
  }
}
