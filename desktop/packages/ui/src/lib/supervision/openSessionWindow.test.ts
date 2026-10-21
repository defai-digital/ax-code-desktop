import { beforeEach, describe, expect, test, vi } from "vitest"

const desktop = vi.hoisted(() => ({ available: true, invoke: vi.fn(async () => undefined) }))
const toast = vi.hoisted(() => ({ error: vi.fn() }))
vi.mock("@/components/ui", () => ({ toast }))
vi.mock("@/lib/desktop", () => ({
  canUseLocalElectronDesktopIPC: () => desktop.available,
  invokeDesktop: desktop.invoke,
}))

import { openSessionWindow } from "./openSessionWindow"

describe("openSessionWindow", () => {
  beforeEach(() => {
    desktop.available = true
    desktop.invoke.mockReset()
    desktop.invoke.mockResolvedValue(undefined)
  })

  test("asks the shell for a session window with its directory", async () => {
    await expect(openSessionWindow({ sessionId: "ses_1", directory: "/repo" }, "failed")).resolves.toBe(true)
    expect(desktop.invoke).toHaveBeenCalledWith("desktop_open_session_mini_chat_window", {
      sessionId: "ses_1",
      directory: "/repo",
    })
  })

  test("does nothing without window support or a session, and reports a failed request", async () => {
    desktop.available = false
    await expect(openSessionWindow({ sessionId: "ses_1", directory: "/repo" }, "failed")).resolves.toBe(false)
    desktop.available = true
    await expect(openSessionWindow({ sessionId: "", directory: "/repo" }, "failed")).resolves.toBe(false)
    expect(desktop.invoke).not.toHaveBeenCalled()
    vi.spyOn(console, "warn").mockImplementation(() => {})
    desktop.invoke.mockRejectedValueOnce(new Error("no window"))
    await expect(openSessionWindow({ sessionId: "ses_1", directory: null }, "failed")).resolves.toBe(false)
    expect(toast.error).toHaveBeenCalledWith("failed")
  })
})
