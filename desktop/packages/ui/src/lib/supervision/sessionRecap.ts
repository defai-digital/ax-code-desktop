import { axCodeClient } from "@/lib/ax-code/client"

/** Which slice of the session a recap summarizes: the latest turn or the recent conversation. */
export type SessionRecapScope = "turn" | "conversation"

export interface SessionRecap {
  text: string
  time: number
  scope: SessionRecapScope
}

const DEFAULT_SCOPE: SessionRecapScope = "turn"

/**
 * A recap written before `scope` existed is still current-turn text, so an
 * omitted field defaults to "turn". Anything present but unrecognized is a
 * corrupt record, not a legacy one.
 */
function readScope(value: unknown): SessionRecapScope | null {
  if (value === undefined) return DEFAULT_SCOPE
  if (value === "turn" || value === "conversation") return value
  return null
}

/**
 * Normalize the `lastRecap` field the session record carries. The projection is
 * untrusted input (older backends, partial writes), so a record that does not
 * validate is treated as "no recap" instead of rendering half of one.
 */
export function readSessionRecap(session: { lastRecap?: unknown } | null | undefined): SessionRecap | null {
  const raw = session?.lastRecap
  if (!raw || typeof raw !== "object") return null
  const record = raw as { text?: unknown; time?: unknown; scope?: unknown }
  if (typeof record.text !== "string") return null
  const text = record.text.trim()
  if (!text) return null
  if (typeof record.time !== "number" || !Number.isFinite(record.time) || record.time <= 0) return null
  const scope = readScope(record.scope)
  if (!scope) return null
  return { text, time: record.time, scope }
}

/**
 * A recap describes the session as of `recap.time`. When the session itself moved
 * on afterwards (beyond the tolerance that covers clock and flush skew) the text
 * is older than the work and the strip has to say so.
 */
export function isRecapStale(
  recap: SessionRecap,
  sessionUpdatedAt: number | null | undefined,
  toleranceMs = 5_000,
): boolean {
  return (
    typeof sessionUpdatedAt === "number" &&
    Number.isFinite(sessionUpdatedAt) &&
    sessionUpdatedAt > recap.time + toleranceMs
  )
}

/**
 * Ask the runtime for a fresh recap. Recaps are read-only and best-effort on the
 * server, and a recap failure is never worth interrupting the user for: a missing
 * text, an error envelope, an abort, or a transport failure all resolve to null.
 */
export async function requestSessionRecap(params: {
  sessionId: string
  directory?: string | null
  scope?: SessionRecapScope
  signal?: AbortSignal
}): Promise<SessionRecap | null> {
  const sessionId = params.sessionId.trim()
  if (!sessionId) return null
  const directory = typeof params.directory === "string" ? params.directory.trim() : ""
  const scope = params.scope ?? "conversation"
  try {
    // Mirror the other session reads: a directory selects the same scoped client,
    // because worktree sessions ignore a per-call directory for some endpoints.
    const client = directory ? axCodeClient.getScopedSdkClient(directory) : axCodeClient.getSdkClient()
    const response = await client.session.recap(
      { sessionID: sessionId, directory: directory || undefined, scope },
      { signal: params.signal },
    )
    if (response.error) return null
    const text = typeof response.data?.text === "string" ? response.data.text.trim() : ""
    if (!text) return null
    return { text, time: Date.now(), scope }
  } catch {
    return null
  }
}
