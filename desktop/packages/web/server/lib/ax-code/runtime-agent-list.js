/**
 * The agents the running runtime knows, over `GET /agent`.
 *
 * Deleting an agent that has no `.md` file and no config entry means "disable this built-in agent":
 * the runtime hides an agent whose config disables it, so a marker is written for it. A name that
 * exists nowhere was accepted the same way, which answered success for a name the user mistyped and
 * left a `disable: true` entry behind that would suppress a later agent of that name. The caller
 * asks this first, so a name the runtime does not know is reported as not found instead.
 */

const agentNamesFromPayload = (payload) => {
  const entries = Array.isArray(payload) ? payload : Array.isArray(payload?.data) ? payload.data : []
  const names = new Set()
  for (const entry of entries) {
    const name = typeof entry?.name === "string" ? entry.name : typeof entry?.id === "string" ? entry.id : ""
    if (name) {
      names.add(name)
    }
  }
  return names
}

export const readRuntimeAgentNames = async ({
  directory,
  buildAxCodeUrl,
  getAxCodeAuthHeaders,
  fetchImpl = fetch,
  timeoutMs = 8000,
}) => {
  if (typeof buildAxCodeUrl !== "function" || typeof fetchImpl !== "function") {
    throw new Error("The runtime's agent list is not reachable")
  }

  const url = new URL(buildAxCodeUrl("/agent", ""))
  if (directory) {
    url.searchParams.set("directory", directory)
  }

  const headers = typeof getAxCodeAuthHeaders === "function" ? getAxCodeAuthHeaders() : undefined
  const response = await fetchImpl(url.toString(), { headers, signal: AbortSignal.timeout(timeoutMs) })
  if (!response?.ok) {
    // Thrown rather than answered with an empty set: an unreachable runtime must not read as "no
    // such agent", which would report a real built-in agent as missing.
    throw new Error(`The runtime answered ${response?.status}`)
  }

  return agentNamesFromPayload(await response.json())
}
