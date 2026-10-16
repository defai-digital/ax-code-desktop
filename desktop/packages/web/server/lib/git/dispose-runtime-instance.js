/**
 * Ask the runtime to release the instance that served a worktree this app is about to delete.
 *
 * The runtime keeps one instance per directory - watchers and file handles included - and nothing
 * released it when the directory was removed, so the instances piled up for as long as the runtime
 * lived and a worktree re-created at the same path was served by their stale state.
 *
 * Best-effort by design: the caller only warns when this answers false or throws, because the
 * worktree removal itself has to go ahead.
 */
export const disposeRuntimeInstance = async ({
  directory,
  buildAxCodeUrl,
  getAxCodeAuthHeaders,
  fetchImpl = fetch,
  timeoutMs = 5000,
}) => {
  const target = typeof directory === "string" ? directory.trim() : ""
  if (!target || typeof buildAxCodeUrl !== "function") {
    return false
  }

  const url = new URL(buildAxCodeUrl("/instance/dispose", ""))
  url.searchParams.set("directory", target)
  const headers = typeof getAxCodeAuthHeaders === "function" ? getAxCodeAuthHeaders() : undefined

  const response = await fetchImpl(url.toString(), {
    method: "POST",
    headers,
    signal: AbortSignal.timeout(timeoutMs),
  })
  return Boolean(response?.ok)
}
