import { axCodeClient } from "./client"
import { buildAxCodeApiUrl } from "./baseUrl"
import { formatSdkError } from "./sdkError"

export class GlobalSessionArchiveUnavailableError extends Error {}

/** Archive metadata is global: historical sessions may no longer have a project directory. */
export async function archiveGlobalSession(sessionId: string, archived: number): Promise<void> {
  const response = await fetch(
    buildAxCodeApiUrl(axCodeClient.getBaseUrl(), `/global/session/${encodeURIComponent(sessionId)}/archive`),
    {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ archived }),
      signal: AbortSignal.timeout(120_000),
    },
  )
  if (!response.ok) {
    const error = await response.json().catch(() => null)
    if (response.status === 404 && !error) {
      throw new GlobalSessionArchiveUnavailableError(
        "The connected AX Code runtime does not support global session archiving. Update the runtime and try again.",
      )
    }
    throw new Error(formatSdkError(error ?? `Session archive failed (${response.status})`))
  }
}
