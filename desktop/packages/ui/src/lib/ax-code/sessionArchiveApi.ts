import { axCodeClient } from "./client"
import { formatSdkError } from "./sdkError"

export class GlobalSessionArchiveUnavailableError extends Error {}

/** Archive metadata is global: historical sessions may no longer have a project directory. */
export async function archiveGlobalSession(sessionId: string, archived: number): Promise<void> {
  const result = await axCodeClient.getSdkClient().global.archiveSession({ sessionID: sessionId, archived })
  if (result.error || !result.response?.ok) {
    const error = result.error
    if (result.response?.status === 404 && (!error || typeof error === "string")) {
      throw new GlobalSessionArchiveUnavailableError(
        "The connected AX Code runtime does not support global session archiving. Update the runtime and try again.",
      )
    }
    throw new Error(formatSdkError(error ?? `Session archive failed (${result.response?.status ?? "no response"})`))
  }
}
