// Capture once per renderer lifetime. Existing schedules keep their stored zone.
export const STARTUP_TIMEZONE = (() => {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC"
  } catch {
    return "UTC"
  }
})()
