import { createAxCodeClient } from "@defai-digital/ax-code-sdk/v2"

// Creating a worktree runs `git worktree add` in the runtime before it answers; the bootstrap itself
// is reported later through events, so this bounds a stuck request, not a slow checkout.
export const WORKTREE_RUNTIME_REQUEST_TIMEOUT_MS = 120_000

const WORKTREE_EVENT_TYPES = new Set(["worktree.ready", "worktree.failed"])

/**
 * The SDK client the git service uses for runtime-owned worktree operations (ADR-020): one client per
 * repository directory, against the managed runtime this server talks to.
 */
export const createWorktreeRuntimeClientFactory = ({
  buildAxCodeUrl,
  getAxCodeAuthHeaders,
  fetchImpl = fetch,
  timeoutMs = WORKTREE_RUNTIME_REQUEST_TIMEOUT_MS,
}) => {
  return (directory) =>
    createAxCodeClient({
      baseUrl: buildAxCodeUrl("/", "").replace(/\/$/, ""),
      directory: directory || undefined,
      headers: typeof getAxCodeAuthHeaders === "function" ? getAxCodeAuthHeaders() : undefined,
      fetch: (request) => fetchImpl(request, { signal: AbortSignal.timeout(timeoutMs) }),
    })
}

/**
 * Feed `worktree.ready` / `worktree.failed` from the runtime's global event stream to `record`, as
 * `{ directory, payload }`. The directory comes from the global event envelope.
 */
export const subscribeWorktreeRuntimeEvents = (globalEventHub, record) => {
  if (typeof globalEventHub?.subscribeEvent !== "function" || typeof record !== "function") {
    return () => {}
  }
  return globalEventHub.subscribeEvent((event) => {
    const outer = event?.payload
    const payload = outer?.payload && typeof outer.payload === "object" ? outer.payload : outer
    if (!payload || !WORKTREE_EVENT_TYPES.has(payload.type)) {
      return undefined
    }
    const directory =
      typeof event?.directory === "string" && event.directory !== "global"
        ? event.directory
        : typeof outer?.directory === "string"
          ? outer.directory
          : ""
    return record({ directory, payload })
  })
}
