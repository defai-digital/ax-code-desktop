import { afterEach, expect, test, vi } from "vitest"
import { axCodeClient } from "./client"
import { archiveGlobalSession, GlobalSessionArchiveUnavailableError } from "./sessionArchiveApi"

const archiveSession = vi.fn()

vi.spyOn(axCodeClient, "getSdkClient").mockReturnValue({ global: { archiveSession } } as never)

afterEach(() => {
  archiveSession.mockReset()
})

test("archives through the published SDK without attaching a project directory", async () => {
  archiveSession.mockResolvedValue({ data: {}, response: new Response("{}", { status: 200 }) })
  await archiveGlobalSession("ses_old", 123)
  expect(archiveSession).toHaveBeenCalledWith({ sessionID: "ses_old", archived: 123 })
})

test("rejects runtime errors instead of counting them as archived", async () => {
  archiveSession.mockResolvedValue({ error: { message: "Unavailable" }, response: new Response(null, { status: 503 }) })
  await expect(archiveGlobalSession("ses_old", 123)).rejects.toThrow("Unavailable")
})

test("distinguishes an unsupported endpoint from a missing stored session", async () => {
  archiveSession
    .mockResolvedValueOnce({ error: "Not Found", response: new Response(null, { status: 404 }) })
    .mockResolvedValueOnce({ error: { message: "Session not found" }, response: new Response(null, { status: 404 }) })
  await expect(archiveGlobalSession("ses_old", 123)).rejects.toBeInstanceOf(GlobalSessionArchiveUnavailableError)
  await expect(archiveGlobalSession("ses_old", 123)).rejects.toThrow("Session not found")
})
