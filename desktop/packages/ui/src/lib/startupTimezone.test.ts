import { afterEach, describe, expect, it, vi } from "vitest"

afterEach(() => {
  vi.restoreAllMocks()
  vi.resetModules()
})

describe("startup timezone", () => {
  it.each(["Asia/Tokyo", "America/New_York", ""])("captures %j once per module lifetime", async (timeZone) => {
    const options = new Intl.DateTimeFormat().resolvedOptions()
    const resolved = vi.spyOn(Intl.DateTimeFormat.prototype, "resolvedOptions").mockReturnValue({ ...options, timeZone })
    vi.resetModules()
    const first = await import("./startupTimezone")
    resolved.mockReturnValue({ ...options, timeZone: "Europe/Berlin" })
    const again = await import("./startupTimezone")
    expect(first.STARTUP_TIMEZONE).toBe(timeZone || "UTC")
    expect(again.STARTUP_TIMEZONE).toBe(first.STARTUP_TIMEZONE)
    expect(resolved).toHaveBeenCalledTimes(1)
  })

  it("falls back to UTC when detection throws", async () => {
    vi.spyOn(Intl.DateTimeFormat.prototype, "resolvedOptions").mockImplementation(() => {
      throw new Error("unavailable")
    })
    vi.resetModules()
    expect((await import("./startupTimezone")).STARTUP_TIMEZONE).toBe("UTC")
  })
})
