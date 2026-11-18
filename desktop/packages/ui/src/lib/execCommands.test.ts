import { afterEach, expect, test, vi } from "vitest"
import { execCommand } from "./execCommands"

afterEach(() => vi.unstubAllGlobals())
test("uses the injected runtime executor without an HTTP command", async () => {
  const result = { command: "pwd", success: true, stdout: "/repo" }
  const execute = vi.fn().mockResolvedValue({ success: true, results: [result] })
  const fetchMock = vi.fn()
  vi.stubGlobal("window", { __AX_CODE_DESKTOP_RUNTIME_APIS__: { files: { execCommands: execute } } })
  vi.stubGlobal("fetch", fetchMock)
  await expect(execCommand("pwd", "/repo")).resolves.toEqual(result)
  expect(execute).toHaveBeenCalledWith(["pwd"], "/repo")
  expect(fetchMock).not.toHaveBeenCalled()
})
test("posts the same foreground execution contract when no runtime API is present", async () => {
  vi.stubGlobal("window", undefined)
  const fetchMock = vi.fn().mockResolvedValue(Response.json({ success: false }))
  vi.stubGlobal("fetch", fetchMock)
  await expect(execCommand("pwd", "/repo")).resolves.toEqual({ command: "pwd", success: false })
  expect(fetchMock).toHaveBeenCalledWith(
    expect.stringContaining("/fs/exec"),
    expect.objectContaining({
      method: "POST",
      body: JSON.stringify({ commands: ["pwd"], cwd: "/repo", background: false }),
    }),
  )
})
test("propagates an unavailable HTTP command boundary", async () => {
  vi.stubGlobal("window", undefined)
  vi.stubGlobal(
    "fetch",
    vi.fn().mockResolvedValue(new Response("unavailable", { status: 503, statusText: "Unavailable" })),
  )
  await expect(execCommand("pwd", "/repo")).rejects.toThrow("Unavailable")
})
