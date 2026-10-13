/**
 * Render an SDK error payload into a short string for Error messages.
 * The SDK returns `{data, error}` shape without throwing on non-2xx; methods
 * that need to signal failure (so callers can preserve state instead of
 * conflating failure with an empty success) wrap the error with this helper.
 */
export function formatSdkError(error: unknown): string {
  if (error instanceof Error) return error.message
  if (typeof error === "string") return error
  if (
    error &&
    typeof error === "object" &&
    "message" in error &&
    typeof (error as { message: unknown }).message === "string"
  ) {
    return (error as { message: string }).message
  }
  try {
    return JSON.stringify(error)
  } catch {
    return String(error)
  }
}
