// S2.6 (SPEC-2026-08-29-desktop-process-model-collapse §2 D6): one-time,
// marker-gated migration of desktop scheduled tasks (project JSON
// `scheduledTasks` keys) into the ax-code runtime `/scheduled-task` store,
// plus the per-boot directory wake-up that starts each runtime instance's
// scheduler (the runtime only boots an instance — and therefore its
// scheduler loop, packages/ax-code/src/project/bootstrap.ts — on the first
// request carrying `?directory=<path>`).
//
// Migration contract (locked in the S2.6 plan):
// - Marker file next to the projects dir (scheduled-tasks-migrated.json)
//   records { migratedAt, attempts, skipped, warnings }. `migratedAt` present
//   means done; absent means retry next boot (up to maxAttempts, then every
//   remaining task is recorded as a skip and the marker is finalized).
// - Idempotency heuristic: before creating, the migration lists the runtime
//   tasks for the directory and skips titles that already exist. A previous
//   half-completed run therefore resumes without duplicates. The title match
//   can false-positive against a user-created task with the same name; that
//   is accepted and documented here rather than adding a core marker field.
// - Only confirmed tasks are removed from the project JSON (confirmed =
//   created now, or already present by title). The `scheduledTasks` key is
//   deleted from the JSON only when nothing remains for that project.
// - Permanent skips (unsupported cron syntax, slash-command prompts, fired
//   one-shots, oversized prompts) are recorded in the marker AND logged so
//   support can see exactly what was dropped.

import { transformDesktopScheduledTask } from "./transform.js"

const DEFAULT_MAX_ATTEMPTS = 5
const DEFAULT_WAKE_CONCURRENCY = 4
const DEFAULT_READY_TIMEOUT_MS = 60_000
const DEFAULT_READY_INTERVAL_MS = 500
const DEFAULT_WAKE_CHECK_MS = 15_000
const DEFAULT_WAKE_REFRESH_MS = 5 * 60_000
const DEFAULT_WAKE_PROJECTS_CHECK_MS = 60_000
const DEFAULT_WAKE_FOLLOW_UP_MS = 60_000
const DEFAULT_WAKE_REQUEST_TIMEOUT_MS = 30_000

// Identity of a scheduled task across the migration's read and its write.
const scheduledTaskKey = (task) => {
  const id = asNonEmptyString(task?.id)
  return id ? `id:${id}` : `name:${asNonEmptyString(task?.name)}`
}

const asNonEmptyString = (value) => {
  if (typeof value !== "string") {
    return null
  }
  const trimmed = value.trim()
  return trimmed.length > 0 ? trimmed : null
}

const safeParseJsonObject = (raw) => {
  try {
    const parsed = JSON.parse(raw)
    return parsed && typeof parsed === "object" && !Array.isArray(parsed) ? parsed : null
  } catch {
    return null
  }
}

export const createScheduledTaskConvergence = (deps) => {
  const {
    fsPromises,
    path,
    projectsDirPath,
    markerPath,
    projectConfigRuntime,
    listProjects,
    buildAxCodeUrl,
    getAxCodeAuthHeaders,
    waitForAxCodeReady,
    expandSnippets,
    logger = console,
    fetchImpl = fetch,
    maxAttempts = DEFAULT_MAX_ATTEMPTS,
    wakeConcurrency = DEFAULT_WAKE_CONCURRENCY,
    readyTimeoutMs = DEFAULT_READY_TIMEOUT_MS,
    readyIntervalMs = DEFAULT_READY_INTERVAL_MS,
    wakeRequestTimeoutMs = DEFAULT_WAKE_REQUEST_TIMEOUT_MS,
  } = deps

  // --- runtime HTTP helpers ---------------------------------------------
  const runtimeRequest = async ({ method, route, directory, body, timeoutMs }) => {
    const base = buildAxCodeUrl("/", "").replace(/\/+$/, "")
    const url = new URL(`${base}${route}`)
    url.searchParams.set("directory", directory)
    const response = await fetchImpl(url.toString(), {
      method,
      headers: {
        ...getAxCodeAuthHeaders(),
        accept: "application/json",
        ...(body !== undefined ? { "content-type": "application/json" } : {}),
      },
      ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
      ...(timeoutMs ? { signal: AbortSignal.timeout(timeoutMs) } : {}),
    })
    if (!response.ok) {
      const text = await response.text().catch(() => "")
      const error = new Error(`runtime ${method} ${route} failed (${response.status})${text ? `: ${text}` : ""}`)
      error.status = response.status
      throw error
    }
    const parsed = await response.json().catch(() => null)
    return parsed
  }

  const listRuntimeTasks = async (directory, options = {}) => {
    const result = await runtimeRequest({
      method: "GET",
      route: "/scheduled-task",
      directory,
      timeoutMs: options.timeoutMs,
    })
    return Array.isArray(result) ? result : []
  }

  const createRuntimeTask = async (directory, payload) => {
    return runtimeRequest({ method: "POST", route: "/scheduled-task", directory, body: payload })
  }

  const pauseRuntimeTask = async (directory, taskID) => {
    return runtimeRequest({
      method: "POST",
      route: `/scheduled-task/${encodeURIComponent(taskID)}/pause`,
      directory,
    })
  }

  // --- marker ------------------------------------------------------------
  const readMarker = async () => {
    try {
      const raw = await fsPromises.readFile(markerPath, "utf8")
      return safeParseJsonObject(raw)
    } catch {
      return null
    }
  }

  const writeMarker = async (record) => {
    const temporaryPath = `${markerPath}.tmp-${process.pid}-${Date.now()}`
    await fsPromises.mkdir(path.dirname(markerPath), { recursive: true })
    await fsPromises.writeFile(temporaryPath, JSON.stringify(record, null, 2), "utf8")
    await fsPromises.rename(temporaryPath, markerPath)
  }

  // --- project enumeration ------------------------------------------------
  const listProjectConfigFiles = async () => {
    let entries
    try {
      entries = await fsPromises.readdir(projectsDirPath)
    } catch (error) {
      if (error && typeof error === "object" && error.code === "ENOENT") {
        return []
      }
      throw error
    }
    return entries.filter((entry) => entry.endsWith(".json")).sort()
  }

  const readProjectConfigFile = async (fileName) => {
    let raw
    try {
      raw = await fsPromises.readFile(path.join(projectsDirPath, fileName), "utf8")
    } catch {
      // A transient I/O failure (EACCES, EMFILE, the file vanishing mid-pass) is not a corrupt
      // file: mark it unreadable so the pass leaves it for next boot instead of finalizing the
      // marker over tasks it never read.
      return { config: null, warning: "project config could not be read; left for next boot" }
    }
    const config = safeParseJsonObject(raw)
    if (!config) {
      // A parse failure can be transient too — a torn read of a non-atomic external write
      // heals on the next boot — so it is left for next boot like the I/O case. A genuinely
      // corrupt file never heals: it burns the boot retries and the marker finalizes after
      // maxAttempts with this warning in its record, instead of skipping the file unseen.
      return { config: null, warning: "project config JSON could not be parsed; left for next boot" }
    }
    return { config }
  }

  const isRetryableRuntimeError = (error) => {
    // 400 = the runtime rejected the payload (it will never accept it);
    // 409 = project task cap reached or a run-state conflict. Both are
    // recorded as permanent skips instead of burning boot retries.
    const status = typeof error?.status === "number" ? error.status : 0
    return !(status === 400 || status === 409)
  }

  // Migrate a single desktop task. Returns "migrated" | { retry: reason } | { skip: reason }.
  const migrateTask = async ({ projectID, projectPath, task, existingByTitle, now }) => {
    const taskLabel = asNonEmptyString(task?.name) || asNonEmptyString(task?.id) || "unnamed"
    const result = transformDesktopScheduledTask(task, {
      now,
      expandPrompt: (prompt) => expandSnippets(prompt, projectPath),
    })
    const warnings = result.warnings.map((warning) => ({ project: projectID, task: taskLabel, warning }))
    if (result.status !== "ready") {
      return { outcome: "skipped", reason: result.reason, taskLabel, warnings }
    }

    for (const payload of result.payloads) {
      const existing = existingByTitle.get(payload.title)
      if (existing) {
        // One entry in the runtime's list accounts for one desktop task. Consuming it here is what keeps a second
        // desktop task with the same name — nothing forbids one — from reading the same entry as "already
        // migrated" and being dropped from the project file: the seventeenth round removed the in-run
        // registration that used to mask this, and a run that had created one of them left the other to be lost
        // on the retry.
        existingByTitle.delete(payload.title)
        // Idempotency: already created by a previous (half-completed) run.
        // A disabled desktop task must still end up paused — a previous run
        // may have created the task but crashed before the pause call.
        if (result.pause && existing.status === "active" && typeof existing.id === "string") {
          try {
            await pauseRuntimeTask(projectPath, existing.id)
            existing.status = "paused"
          } catch (error) {
            if (isRetryableRuntimeError(error)) {
              return { outcome: "retry", reason: error.message, taskLabel, warnings }
            }
            warnings.push({
              project: projectID,
              task: taskLabel,
              warning: `created earlier but pause failed permanently: ${error.message}`,
            })
          }
        }
        continue
      }
      let created
      try {
        created = await createRuntimeTask(projectPath, payload)
      } catch (error) {
        if (isRetryableRuntimeError(error)) {
          return { outcome: "retry", reason: error.message, taskLabel, warnings }
        }
        return { outcome: "skipped", reason: error.message, taskLabel, warnings }
      }
      const createdID = typeof created?.id === "string" ? created.id : null
      // Deliberately not recorded in `existingByTitle`. That map is the resume heuristic — "the runtime already
      // had a task with this title before this run" — and registering the task created a moment ago made the
      // next desktop task with the same name read as already migrated: it left the project file with no runtime
      // task and no skip record. Two desktop tasks may share a name (nothing enforces uniqueness) and the
      // runtime accepts duplicate titles. Resume still works: the next run lists the runtime tasks.
      if (result.pause) {
        if (createdID) {
          try {
            await pauseRuntimeTask(projectPath, createdID)
          } catch (error) {
            // The task exists in the runtime from here on, so the next run's title check finds it and retries
            // only the pause.
            if (isRetryableRuntimeError(error)) {
              return { outcome: "retry", reason: error.message, taskLabel, warnings }
            }
            warnings.push({
              project: projectID,
              task: taskLabel,
              warning: `created but pause failed permanently: ${error.message}`,
            })
          }
        } else {
          warnings.push({
            project: projectID,
            task: taskLabel,
            warning: "created without a readable id; pause was skipped and the task is active",
          })
        }
      }
    }
    return { outcome: "migrated", taskLabel, warnings }
  }

  const migrate = async () => {
    const marker = await readMarker()
    if (marker && typeof marker.migratedAt === "number") {
      return { migrated: false, reason: "marker-present" }
    }
    const attempts = (typeof marker?.attempts === "number" ? marker.attempts : 0) + 1
    const skipped = Array.isArray(marker?.skipped) ? marker.skipped.slice() : []
    const warnings = Array.isArray(marker?.warnings) ? marker.warnings.slice() : []
    const now = Date.now()

    const files = await listProjectConfigFiles()
    let settingsProjects = []
    try {
      settingsProjects = await listProjects()
    } catch {
      settingsProjects = []
    }
    const settingsPathByID = new Map()
    for (const project of settingsProjects) {
      const id = asNonEmptyString(project?.id)
      const projectPath = asNonEmptyString(project?.path)
      if (id && projectPath) {
        settingsPathByID.set(id, projectPath)
      }
    }

    // Per-file remaining tasks, kept for the attempts-exhausted cleanup, and the keys this pass settled — the
    // exhaustion write has to remove those from the file too: if the loop threw before its removal wrote, they stay
    // listed with nothing left to clean them up once the marker is finalized.
    const remainingByFile = new Map()
    const settledKeysByFile = new Map()
    let retryableRemaining = 0

    for (const fileName of files) {
      const fileStem = fileName.slice(0, -".json".length)
      const readResult = await readProjectConfigFile(fileName)
      if (!readResult.config) {
        // Counted like the runtime-unreachable case below: the file is left untouched and
        // its tasks retry next boot instead of being skipped past the marker.
        retryableRemaining += 1
        warnings.push({ project: fileStem, task: null, warning: readResult.warning })
        continue
      }
      // The file name is the project id only while that id fits in a name: a longer one is written under a
      // bounded stem with a digest, and the id it belongs to is inside the file.
      const config = readResult.config
      const projectID = asNonEmptyString(config.projectID) || fileStem
      const tasks = Array.isArray(config.scheduledTasks) ? config.scheduledTasks : []
      if (tasks.length === 0) {
        continue
      }
      const projectPath =
        asNonEmptyString(config.projectPath) || asNonEmptyString(config.path) || settingsPathByID.get(projectID) || null
      if (!projectPath) {
        for (const task of tasks) {
          // Not a permanent skip: the task stays in the project JSON and retries
          // next boot, so recording it in the marker's `skipped` list would
          // report as dropped a task that later migrated fine. Warn instead,
          // matching the runtime-unreachable branch below.
          warnings.push({
            project: projectID,
            task: asNonEmptyString(task?.name) || asNonEmptyString(task?.id) || "unnamed",
            warning: "project path is unavailable; left for next boot",
          })
        }
        // The path may be unresolvable only this boot (settings not loaded yet).
        // The tasks were never handed to the runtime, so deleting them here loses
        // them for good; keep them retryable like the runtime-unreachable case.
        retryableRemaining += tasks.length
        remainingByFile.set(projectID, tasks)
        continue
      }

      let existingByTitle
      try {
        const existing = await listRuntimeTasks(projectPath)
        existingByTitle = new Map()
        for (const task of existing) {
          if (typeof task?.title === "string") {
            existingByTitle.set(task.title, task)
          }
        }
      } catch (error) {
        // Runtime unreachable mid-migration: leave the file untouched so the
        // whole project retries next boot.
        retryableRemaining += tasks.length
        remainingByFile.set(projectID, tasks)
        logger.warn("[ScheduledTaskMigration] runtime task list failed; project left for next boot", {
          project: projectID,
          error: error?.message || String(error),
        })
        continue
      }

      const remaining = []
      // What this migration settles, by identity: the tasks it migrated and the ones it is permanently
      // skipping. The write below removes exactly these from the file as it stands then, instead of
      // replacing it with the list read before the runtime calls.
      const settledTaskKeys = new Set()
      // What this project still has to hand over: set inside the `try` and corrected by the `catch`, then counted
      // once — counting inside the `try` as well made a project that failed on its file write report its tasks
      // twice.
      let projectRemaining
      try {
        for (const task of tasks) {
          const outcome = await migrateTask({ projectID, projectPath, task, existingByTitle, now })
          warnings.push(...outcome.warnings)
          if (outcome.outcome === "retry") {
            remaining.push(task)
            continue
          }
          // Not a retry, so this task is settled either way: it was handed to the runtime or it is being
          // skipped permanently. Both leave the project file.
          settledTaskKeys.add(scheduledTaskKey(task))
          if (outcome.outcome === "skipped") {
            // A task can be skipped again on a later boot when the write that would have removed it from the file
            // failed, and the marker is a support-facing record: the same skip is listed once.
            const record = { project: projectID, task: outcome.taskLabel, reason: outcome.reason }
            if (!skipped.some((entry) => entry.project === record.project && entry.task === record.task && entry.reason === record.reason)) {
              skipped.push(record)
            }
            logger.warn("[ScheduledTaskMigration] task skipped", {
              project: projectID,
              task: outcome.taskLabel,
              reason: outcome.reason,
            })
          }
        }
        projectRemaining = remaining
        await projectConfigRuntime.replaceScheduledTasks(projectID, (currentTasks) =>
          currentTasks.filter((task) => !settledTaskKeys.has(scheduledTaskKey(task))),
        )
      } catch (error) {
        // The runtime answers are classified retry-vs-permanent so that one bad task cannot abort the pass, but a
        // *local* failure — a snippet directory that cannot be read, a project id the config layer refuses — was
        // not, and it escaped both loops. The marker is only written once the loops finish, so the pass never
        // advanced `attempts`, the attempts-exhausted branch could not fire, and every project file after this one
        // was never migrated at all: their scheduled tasks simply stopped firing, with one log line to show for it.
        // Left as a retry, the project is read again next boot like the runtime-unreachable case above — and only
        // the tasks it did not settle: the ones it migrated are in the runtime, and re-listing them as remaining
        // made the attempts-exhausted branch record them as dropped, removing them from the project file.
        projectRemaining = tasks.filter((task) => !settledTaskKeys.has(scheduledTaskKey(task)))
        logger.warn("[ScheduledTaskMigration] project left for next boot", {
          project: projectID,
          error: error?.message || String(error),
        })
        if (settledTaskKeys.size > 0 && projectRemaining.length === 0) {
          // Every task this project had is settled and the write that removes them from the file is what failed:
          // the pass would otherwise report `migrated` for a project whose file still lists them, and the marker's
          // `migratedAt` stops the next boot from trying again.
          warnings.push({
            project: projectID,
            task: null,
            warning: "settled tasks could not be removed from the project file",
          })
        }
      }
      retryableRemaining += projectRemaining.length
      remainingByFile.set(projectID, projectRemaining)
      settledKeysByFile.set(projectID, settledTaskKeys)
    }

    if (retryableRemaining === 0) {
      await writeMarker({ migratedAt: Date.now(), attempts, skipped, warnings })
      return { migrated: true, attempts, skippedCount: skipped.length }
    }

    if (attempts >= maxAttempts) {
      for (const [projectID, remaining] of remainingByFile) {
        // Every project in this map has something to remove: it entered the loop with tasks, and each of them
        // either stayed for a retry or was settled and has to leave the file. There is nothing to skip here — a
        // guard that skipped an empty remainder also skipped the file whose settled-task removal is what failed,
        // which is the stranding this write exists to clean up.
        const settledKeys = [...(settledKeysByFile.get(projectID) ?? [])]
        for (const task of remaining) {
          skipped.push({
            project: projectID,
            task: asNonEmptyString(task?.name) || asNonEmptyString(task?.id) || "unnamed",
            reason: `migration attempts exhausted (${maxAttempts})`,
          })
        }
        // The recorded tasks are what leaves the file: passing a literal `[]` also deleted a task saved while
        // the pass was talking to the runtime, and recorded nothing about it.
        const exhaustedKeys = new Set([...remaining.map((task) => scheduledTaskKey(task)), ...settledKeys])
        await projectConfigRuntime.replaceScheduledTasks(projectID, (currentTasks) =>
          currentTasks.filter((task) => !exhaustedKeys.has(scheduledTaskKey(task))),
        )
      }
      await writeMarker({ migratedAt: Date.now(), attempts, skipped, warnings })
      return { migrated: true, attempts, exhausted: true, skippedCount: skipped.length }
    }

    // Progress marker: no migratedAt, so the next boot retries the tasks that
    // remain in the project JSONs.
    await writeMarker({ attempts, lastAttemptAt: Date.now(), skipped, warnings })
    return { migrated: false, reason: "retry-pending", attempts, retryableRemaining }
  }

  const listProjectDirectories = async () => {
    let projects = []
    try {
      projects = await listProjects()
    } catch (error) {
      logger.warn("[ScheduledTaskMigration] project list unavailable for scheduler wake-up", {
        error: error?.message || String(error),
      })
      return null
    }
    const directories = []
    const seen = new Set()
    for (const project of Array.isArray(projects) ? projects : []) {
      const projectPath = asNonEmptyString(project?.path)
      if (projectPath && !seen.has(projectPath)) {
        seen.add(projectPath)
        directories.push(projectPath)
      }
    }
    return directories
  }

  // Wake the given directories with bounded concurrency. Resolves to the
  // directories whose wake request succeeded so callers can retry the rest.
  const wakeDirectories = async (directories) => {
    const woken = []
    let index = 0
    const worker = async () => {
      while (index < directories.length) {
        const directory = directories[index]
        index += 1
        try {
          // Bounded: a runtime that accepts the connection but never answers
          // (e.g. a process in its shutdown grace period) must not wedge the
          // wake pass. The instance keeps booting server-side either way.
          await listRuntimeTasks(directory, { timeoutMs: wakeRequestTimeoutMs })
          woken.push(directory)
        } catch (error) {
          // Non-fatal: the scheduler also starts when the user opens the
          // project, and the wake watch retries on its next check.
          logger.warn("[ScheduledTaskMigration] scheduler wake-up failed for directory", {
            directory,
            error: error?.message || String(error),
          })
        }
      }
    }
    const workers = []
    for (let i = 0; i < Math.min(wakeConcurrency, directories.length); i += 1) {
      workers.push(worker())
    }
    await Promise.all(workers)
    return woken
  }

  // Wake each registered project directory's runtime instance so its
  // scheduler loop starts even before the user opens that project. A plain
  // GET /scheduled-task?directory=<path> is enough — the runtime bootstraps
  // the instance (and starts the scheduler) on the first scoped request.
  const wakeUp = async () => {
    const directories = await listProjectDirectories()
    if (!directories) return []
    return wakeDirectories(directories)
  }

  // The boot-time wake-up is not enough on its own: a runtime restart
  // (settings change, health-check recovery, external server restart) drops
  // every instance, and instances only come back on their next scoped
  // request, so projects the user has not opened would stop firing. The watch
  // re-wakes every directory when the runtime identity changes, wakes newly
  // registered projects, and re-wakes everything on a slow refresh to cover
  // restarts it cannot observe (an external runtime on the same origin).
  // Identity checks are in memory; the project list (a settings read) is only
  // consulted on a full wake or every `projectsCheckMs`. An occurrence missed
  // in the gap follows the task's catch-up policy (`run_once` coalesces it
  // into one run, `skip` drops it).
  let activeWatch = null

  const stopWakeWatch = () => {
    if (!activeWatch) return
    activeWatch.stop()
    activeWatch = null
  }

  const startWakeWatch = ({
    getRuntimeIdentity,
    isActive = () => true,
    initialDirectories = [],
    // Identity the initial directories were woken against; null forces a
    // full wake on the first check that sees a ready runtime.
    initialIdentity,
    checkMs = DEFAULT_WAKE_CHECK_MS,
    refreshMs = DEFAULT_WAKE_REFRESH_MS,
    projectsCheckMs = DEFAULT_WAKE_PROJECTS_CHECK_MS,
    followUpMs = DEFAULT_WAKE_FOLLOW_UP_MS,
    now = Date.now,
  } = {}) => {
    stopWakeWatch()
    if (typeof getRuntimeIdentity !== "function") {
      throw new Error("startWakeWatch requires getRuntimeIdentity")
    }
    const woken = new Set(initialDirectories)
    let lastIdentity = initialIdentity === undefined ? getRuntimeIdentity() : initialIdentity
    let lastFullWakeAt = now()
    let lastProjectsCheckAt = now()
    let followUpAt = null
    let inFlight = null
    let stopped = false

    const check = async () => {
      if (stopped || inFlight || !isActive()) return
      const identity = getRuntimeIdentity()
      // null/undefined means the runtime is not ready (or Desktop could not
      // confirm it). Only the slow refresh probes it then: a failed external
      // re-probe can leave readiness false while the runtime is actually up.
      const identityKnown = identity !== null && identity !== undefined
      const identityChanged = identityKnown && identity !== lastIdentity
      const refreshDue = now() - lastFullWakeAt >= refreshMs
      const followUpDue = followUpAt !== null && now() >= followUpAt
      const fullWake = identityChanged || refreshDue || (identityKnown && followUpDue)
      if (!identityKnown && !refreshDue) return
      if (!fullWake && now() - lastProjectsCheckAt < projectsCheckMs) return
      inFlight = (async () => {
        lastProjectsCheckAt = now()
        const directories = await listProjectDirectories()
        if (!directories || stopped) return
        const registered = new Set(directories)
        for (const directory of woken) {
          if (!registered.has(directory)) woken.delete(directory)
        }
        const targets = fullWake ? directories : directories.filter((directory) => !woken.has(directory))
        if (targets.length === 0 && !fullWake) return
        if (fullWake) woken.clear()
        const succeeded = await wakeDirectories(targets)
        for (const directory of succeeded) woken.add(directory)
        if (!fullWake) return
        lastFullWakeAt = now()
        // Adopt the identity only if it held for the whole pass; a restart
        // that finished mid-pass leaves it stale so the next check re-wakes.
        if (identityKnown && getRuntimeIdentity() === identity) {
          lastIdentity = identity
        }
        // After a restart, wake once more shortly afterwards: the first pass
        // can reach a process that is about to be replaced on the same origin.
        if (identityChanged) {
          followUpAt = now() + followUpMs
        } else if (followUpDue) {
          followUpAt = null
        }
      })()
      try {
        await inFlight
      } catch (error) {
        logger.warn("[ScheduledTaskMigration] scheduler wake watch check failed", {
          error: error?.message || String(error),
        })
      } finally {
        inFlight = null
      }
    }

    const timer = setInterval(() => {
      void check()
    }, checkMs)
    timer.unref?.()

    const watch = {
      check,
      stop: () => {
        stopped = true
        clearInterval(timer)
      },
    }
    activeWatch = watch
    return watch
  }

  const start = async () => {
    try {
      await waitForAxCodeReady(readyTimeoutMs, readyIntervalMs)
    } catch (error) {
      // Non-fatal and deliberately not counted as a migration attempt: the
      // marker is untouched, so the next boot retries everything.
      logger.warn("[ScheduledTaskMigration] runtime not ready; migration deferred to next boot", {
        error: error?.message || String(error),
      })
      return []
    }

    try {
      const result = await migrate()
      if (result.migrated) {
        logger.info("[ScheduledTaskMigration] desktop scheduled tasks migration finished", {
          attempts: result.attempts,
          skippedCount: result.skippedCount,
          exhausted: result.exhausted === true,
        })
      }
    } catch (error) {
      logger.warn("[ScheduledTaskMigration] migration pass failed; will retry on next boot", {
        error: error?.message || String(error),
      })
    }

    return wakeUp()
  }

  return {
    start,
    migrate,
    wakeUp,
    startWakeWatch,
    stopWakeWatch,
  }
}
