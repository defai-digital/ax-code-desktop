import { beforeEach, describe, expect, test, vi } from "vitest"

const shellSend = vi.fn()

vi.mock("@/lib/ax-code/client", () => ({
  axCodeClient: {
    getDirectory: () => "/proj-a",
    setDirectory: () => {},
    getSdkClient: () => ({ session: { shell: (...args: unknown[]) => shellSend(...args) } }),
  },
}))

const { routeMessage } = await import("./session-ui-store")

const sendShell = () =>
  routeMessage({
    sessionId: "session-1",
    content: "ls -la",
    providerID: "provider",
    modelID: "model",
    inputMode: "shell",
  })

describe("shell input send", () => {
  beforeEach(() => {
    shellSend.mockReset()
  })

  test("rejects when the runtime refuses the command", async () => {
    // The generated SDK resolves with `{ error }` instead of throwing, so an unchecked send
    // counted as delivered: the composer cleared and the command never ran.
    shellSend.mockResolvedValueOnce({ error: { message: "Session is busy" } })

    await expect(sendShell()).rejects.toThrow("Session is busy")
  })

  test("resolves when the runtime accepted the command", async () => {
    shellSend.mockResolvedValueOnce({ data: true })

    await expect(sendShell()).resolves.toBeUndefined()
    expect(shellSend).toHaveBeenCalledWith(
      expect.objectContaining({ sessionID: "session-1", command: "ls -la", directory: "/proj-a" }),
    )
  })
})
