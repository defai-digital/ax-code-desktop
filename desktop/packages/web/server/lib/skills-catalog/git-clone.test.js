import { beforeEach, describe, expect, it, vi } from "vitest"

const { execFileAsync } = vi.hoisted(() => ({ execFileAsync: vi.fn() }))
vi.mock("child_process", async (importOriginal) => {
  const actual = await importOriginal()
  const execFile = vi.fn()
  execFile[Symbol.for("nodejs.util.promisify.custom")] = execFileAsync
  return { ...actual, execFile }
})

const { cloneRepo } = await import("./git.js")

beforeEach(() => {
  execFileAsync.mockReset()
})

describe("skill repository clone boundary", () => {
  const options = { cloneUrl: "https://example.com/owner/repo.git", tempDir: "/tmp/skill-clone", timeoutMs: 1234 }

  it("falls back to a shallow clone when partial cloning is unsupported", async () => {
    execFileAsync.mockRejectedValueOnce(new Error("filtering not supported"))
    execFileAsync.mockResolvedValueOnce({ stdout: "", stderr: "" })

    await expect(cloneRepo(options)).resolves.toEqual({ ok: true })
    expect(execFileAsync).toHaveBeenCalledTimes(2)
    const [preferred, fallback] = execFileAsync.mock.calls
    expect(preferred[1]).toContain("--filter=blob:none")
    expect(fallback[1]).not.toContain("--filter=blob:none")
    expect(fallback[1]).toContain("--no-checkout")
    expect(fallback[2].timeout).toBe(1234)
  })

  it("classifies an authentication refusal once at the clone boundary", async () => {
    execFileAsync.mockRejectedValue(Object.assign(new Error("clone failed"), { stderr: "Permission denied (publickey)" }))

    await expect(cloneRepo(options)).resolves.toEqual({
      ok: false,
      error: { kind: "authRequired", message: "Authentication required to access this repository", sshOnly: true },
    })
  })

  it("preserves network diagnostics in the existing catalog error shape", async () => {
    execFileAsync.mockRejectedValue(Object.assign(new Error("clone failed"), { stderr: "Connection timed out" }))

    await expect(cloneRepo(options)).resolves.toEqual({
      ok: false,
      error: { kind: "networkError", message: "Connection timed out\nclone failed" },
    })
  })
})
