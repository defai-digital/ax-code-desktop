import { afterEach, expect, test, vi } from "vitest"
import { axCodeClient } from "./client"
import { archiveGlobalSession } from "./sessionArchiveApi"

afterEach(() => {
  vi.restoreAllMocks()
  vi.unstubAllGlobals()
})

test("archives through the authenticated global API without attaching a project directory", async () => {
  vi.spyOn(axCodeClient, "getBaseUrl").mockReturnValue("http://localhost:4096/api")
  const fetch = vi.fn().mockResolvedValue(new Response("{}", { status: 200 }))
  vi.stubGlobal("fetch", fetch)
  await archiveGlobalSession("ses_old", 123)
  expect(fetch).toHaveBeenCalledWith("http://localhost:4096/api/global/session/ses_old/archive", {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ archived: 123 }),
    signal: expect.any(AbortSignal),
  })
})

test("rejects runtime errors instead of counting them as archived", async () => {
  vi.stubGlobal(
    "fetch",
    vi.fn().mockResolvedValue(new Response(JSON.stringify({ message: "Unavailable" }), { status: 503 })),
  )
  await expect(archiveGlobalSession("ses_old", 123)).rejects.toThrow("Unavailable")
})

test("distinguishes an unsupported endpoint from a missing stored session", async () => {
  vi.stubGlobal(
    "fetch",
    vi
      .fn()
      .mockResolvedValueOnce(new Response("Not Found", { status: 404 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({ message: "Session not found" }), { status: 404 })),
  )
  await expect(archiveGlobalSession("ses_old", 123)).rejects.toThrow("Update the runtime")
  await expect(archiveGlobalSession("ses_old", 123)).rejects.toThrow("Session not found")
})
