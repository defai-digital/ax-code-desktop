export type ManualUpdateCheckOutcome = "failed" | "open-update" | "up-to-date"

export function manualUpdateCheckOutcome(state: {
  error: string | null
  available: boolean
  info: unknown
  runtimeType: "desktop" | "web" | null
}): ManualUpdateCheckOutcome {
  if (state.runtimeType == null || state.error || (state.available && state.info == null)) {
    return "failed"
  }
  if (state.available) {
    return "open-update"
  }
  return "up-to-date"
}
