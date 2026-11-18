import { axCodeClient } from "@/lib/ax-code/client"
import { readDirectoryPath } from "@/lib/pathValues"
import { formatSdkError } from "@/lib/ax-code/sdkError"

/**
 * `GET /session/{sessionID}/goal` through the published SDK client. A null body is a session
 * with no goal, not a failure. `directory` selects the same scoped client other session reads use.
 */
export async function fetchSessionGoal(sessionId: string, directory?: string | null): Promise<unknown> {
  const trimmedSession = sessionId.trim()
  if (!trimmedSession) throw new Error("A session id is required")
  const trimmedDirectory = typeof directory === "string" ? readDirectoryPath(directory) : ""
  const client = trimmedDirectory ? axCodeClient.getScopedSdkClient(trimmedDirectory) : axCodeClient.getSdkClient()
  const response = await client.session.goal({
    sessionID: trimmedSession,
    ...(trimmedDirectory ? { directory: trimmedDirectory } : {}),
  })
  if (response.error) throw new Error(formatSdkError(response.error))
  return response.data ?? null
}
