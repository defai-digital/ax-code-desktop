import { createHash } from "node:crypto"

const PROJECT_CONFIG_VERSION = 1
// A project id is `path_` + base64url of the whole project path (project-id.js), so a long path pushes
// the config file name past the filesystem's 255-byte limit and the file can be neither written nor
// read. Ids that fit keep their name; longer ones keep a readable prefix and a digest of the rest.
const MAX_PROJECT_CONFIG_STEM_LENGTH = 96

// Exported: settings-runtime's project-storage migration writes into the same directory
// and must name files identically, or a long project id blows past the filesystem's
// 255-byte name limit there (ENAMETOOLONG) while this module reads the bounded name.
export const projectConfigFileStemOf = (projectID) =>
  projectID.length <= MAX_PROJECT_CONFIG_STEM_LENGTH
    ? projectID
    : `${projectID.slice(0, MAX_PROJECT_CONFIG_STEM_LENGTH)}-${createHash("sha256")
        .update(projectID)
        .digest("hex")
        .slice(0, 24)}`

const asNonEmptyString = (value) => {
  if (typeof value !== "string") {
    return null
  }
  const trimmed = value.trim()
  return trimmed.length > 0 ? trimmed : null
}

// Scheduled tasks are owned by the AX Code runtime; the `scheduledTasks` key left in a project config file is
// legacy data that the boot migration (scheduled-task-convergence) moves there and then removes. This module
// is that migration's only write path, so it works on the tasks exactly as stored and never normalizes them.
export const createProjectConfigRuntime = (deps) => {
  const { fsPromises, path, projectsDirPath } = deps

  const writeLocks = new Map()

  const sanitizeProjectID = (projectID) => {
    const value = asNonEmptyString(projectID)
    if (!value) {
      throw new Error("projectId is required")
    }
    if (!/^[a-zA-Z0-9._:-]+$/.test(value)) {
      throw new Error("projectId contains unsupported characters")
    }
    return value
  }

  const resolveProjectConfigPath = (projectID) => {
    const safeProjectID = sanitizeProjectID(projectID)
    return path.join(projectsDirPath, `${projectConfigFileStemOf(safeProjectID)}.json`)
  }

  // The path to read from, in order: the bounded name above, then the full-id name an earlier version
  // wrote. The second only exists when the first differs — for an id whose file name was too long for
  // the filesystem, which is what made the project's config unreadable and unwritable.
  const projectConfigReadPaths = (projectID) => {
    const safeProjectID = sanitizeProjectID(projectID)
    const paths = [resolveProjectConfigPath(safeProjectID)]
    if (projectConfigFileStemOf(safeProjectID) !== safeProjectID) {
      paths.push(path.join(projectsDirPath, `${safeProjectID}.json`))
    }
    return paths
  }

  /**
   * Drop the file an earlier version wrote under the full id, once a write has landed under the bounded name.
   *
   * The readers that enumerate the directory take every `*.json` for a project, so leaving the old file
   * behind means the same project is seen twice — its tasks migrated a second time, and tasks deleted since
   * reappearing from the stale copy. Best-effort: a refusal leaves the write itself intact.
   */
  const removeLegacyProjectConfigFile = async (projectID) => {
    const safeProjectID = sanitizeProjectID(projectID)
    if (projectConfigFileStemOf(safeProjectID) === safeProjectID) {
      return
    }
    await fsPromises.rm(path.join(projectsDirPath, `${safeProjectID}.json`), { force: true }).catch(() => {})
  }

  const readRawProjectConfigFromDisk = async (projectID) => {
    const paths = projectConfigReadPaths(projectID)
    for (const [index, filePath] of paths.entries()) {
      try {
        const raw = await fsPromises.readFile(filePath, "utf8")
        const parsed = JSON.parse(raw)
        return parsed && typeof parsed === "object" && !Array.isArray(parsed) ? parsed : {}
      } catch (error) {
        if (index < paths.length - 1 && (error?.code === "ENOENT" || error?.code === "ENAMETOOLONG")) {
          continue
        }
        if (error && typeof error === "object" && error.code === "ENOENT") {
          return {}
        }
        if (error && typeof error === "object" && error.code === "ENAMETOOLONG") {
          // Nothing readable under either name: an empty config, not a failed read.
          return {}
        }
        throw error
      }
    }
    return {}
  }

  // A failed write (a full disk) or rename (the target became a directory) would otherwise leave a full copy
  // of the config behind under a unique name on every attempt.
  const writeFileAtomically = async (temporaryPath, filePath, contents) => {
    try {
      await fsPromises.writeFile(temporaryPath, contents, "utf8")
      await fsPromises.rename(temporaryPath, filePath)
    } catch (error) {
      await fsPromises.rm(temporaryPath, { force: true }).catch(() => {})
      throw error
    }
  }

  // S2.6 (SPEC-2026-08-29-desktop-process-model-collapse §2 D6): the runtime
  // migration rewrites the task list after each project pass and deletes the
  // server-owned `scheduledTasks` key entirely once nothing remains, so the
  // JSON no longer looks like an unmigrated store. Atomic tmp+rename; every
  // other key is preserved verbatim.
  const writeScheduledTasksToDisk = async (projectID, tasks) => {
    const filePath = resolveProjectConfigPath(projectID)
    const parentDirectory = path.dirname(filePath)
    const temporaryPath = `${filePath}.tmp-${process.pid}-${Date.now()}-${Math.random().toString(16).slice(2)}`

    const existing = await readRawProjectConfigFromDisk(projectID)
    const merged = {
      ...existing,
      version: PROJECT_CONFIG_VERSION,
      projectID: sanitizeProjectID(projectID),
    }
    if (tasks.length > 0) {
      merged.scheduledTasks = tasks
    } else {
      delete merged.scheduledTasks
    }

    await fsPromises.mkdir(parentDirectory, { recursive: true })
    await writeFileAtomically(temporaryPath, filePath, JSON.stringify(merged, null, 2))
    await removeLegacyProjectConfigFile(projectID)
  }

  const withProjectWriteLock = async (projectID, mutate) => {
    const key = sanitizeProjectID(projectID)
    const previous = writeLocks.get(key) || Promise.resolve()
    let release
    const next = new Promise((resolve) => {
      release = resolve
    })
    const chained = previous.finally(() => next)
    writeLocks.set(key, chained)

    await previous
    try {
      return await mutate()
    } finally {
      release()
      const current = writeLocks.get(key)
      if (current === chained) {
        writeLocks.delete(key)
      }
    }
  }

  // S2.6: replace the whole task list with the tasks that still need migration.
  // An empty list deletes the key; the key is never deleted while any task
  // still awaits confirmation in the runtime.
  const replaceScheduledTasks = async (projectID, tasksOrUpdater) => {
    return withProjectWriteLock(projectID, async () => {
      // An updater is handed the list as it is *now*, inside the lock. A caller that computed its list
      // from an earlier read — the boot migration reads the file, talks to the runtime for seconds and
      // then writes back — would otherwise replace whatever another write landed in the meantime.
      //
      // The list is the raw one on disk, in stored order, so a caller that reconciles the tasks it read itself
      // (the migration filters by their identity) matches exactly the entries it saw: none dropped, none renamed.
      let resolved
      if (Array.isArray(tasksOrUpdater)) {
        resolved = tasksOrUpdater
      } else {
        const raw = (await readRawProjectConfigFromDisk(projectID)).scheduledTasks
        resolved = await tasksOrUpdater(Array.isArray(raw) ? raw : [])
      }
      // Refused, not coerced: an updater that returns something else is a contract violation, and
      // `writeScheduledTasksToDisk` deletes the key for an empty list — so the old fallback answered a
      // broken caller by erasing every scheduled task in the project with nothing logged.
      if (!Array.isArray(resolved)) {
        throw new Error(`replaceScheduledTasks expects an array of tasks, received ${typeof resolved}`)
      }
      const nextTasks = resolved
      await writeScheduledTasksToDisk(projectID, nextTasks)
      return {
        tasks: nextTasks,
      }
    })
  }

  return {
    replaceScheduledTasks,
    resolveProjectConfigPath,
  }
}
