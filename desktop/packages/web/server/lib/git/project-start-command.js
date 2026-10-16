/**
 * The project's start command (`commands.start`): what the runtime runs in every new worktree of
 * a project, such as a dependency install.
 *
 * The runtime keeps the command on its project record in its own database and hands it out over
 * `GET /project` only. This used to read `<data dir>/storage/project/<id>.json`, which is the
 * format the runtime migrated *from* and no longer writes, so a project's start command never
 * ran. `GET /project` reads the database directly, where `/project/current` answers from the
 * instance's cached record and can still report a command that was changed since it booted.
 *
 * A failed read runs no command and says why, the same outcome as a failing command: the worktree
 * itself is still created.
 */
export const readRuntimeProjectStartCommand = async ({
  projectID,
  buildAxCodeUrl,
  getAxCodeAuthHeaders,
  fetchImpl = fetch,
  timeoutMs = 8000,
}) => {
  const id = typeof projectID === "string" ? projectID.trim() : ""
  if (!id || typeof buildAxCodeUrl !== "function" || typeof fetchImpl !== "function") {
    return ""
  }

  try {
    const headers = typeof getAxCodeAuthHeaders === "function" ? getAxCodeAuthHeaders() : undefined
    const response = await fetchImpl(new URL(buildAxCodeUrl("/project", "")).toString(), {
      headers,
      signal: AbortSignal.timeout(timeoutMs),
    })
    if (!response?.ok) {
      console.warn(`Failed to read the project start command: the runtime answered ${response?.status}`)
      return ""
    }

    const projects = await response.json()
    const project = Array.isArray(projects) ? projects.find((entry) => entry?.id === id) : null
    return typeof project?.commands?.start === "string" ? project.commands.start.trim() : ""
  } catch (error) {
    console.warn(
      "Failed to read the project start command from the runtime:",
      error instanceof Error ? error.message : String(error),
    )
    return ""
  }
}
