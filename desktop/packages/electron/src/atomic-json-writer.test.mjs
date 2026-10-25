import { describe, expect, it, vi } from "vitest"
import { createAtomicJsonWriter } from "./atomic-json-writer.js"

function fixture() {
  const filesystem = {
    mkdir: vi.fn().mockResolvedValue(undefined),
    writeFile: vi.fn().mockResolvedValue(undefined),
    rename: vi.fn().mockResolvedValue(undefined),
    rm: vi.fn().mockResolvedValue(undefined),
  }
  const wait = vi.fn().mockResolvedValue(undefined)
  return { filesystem, wait }
}

describe("atomic JSON replacement", () => {
  it.each(["EPERM", "EACCES", "EBUSY"])(
    "retries transient Windows %s without rewriting or removing the destination",
    async (code) => {
      const f = fixture()
      f.filesystem.rename.mockRejectedValueOnce(Object.assign(new Error("locked"), { code }))
      await createAtomicJsonWriter({ ...f, platform: "win32" })("/profile/settings.json", { projects: ["kept"] })
      expect(f.filesystem.rename).toHaveBeenCalledTimes(2)
      expect(f.filesystem.writeFile).toHaveBeenCalledExactlyOnceWith(
        expect.stringContaining("settings.json.tmp-"),
        JSON.stringify({ projects: ["kept"] }, null, 2),
      )
      expect(f.wait).toHaveBeenCalledExactlyOnceWith(25)
      expect(f.filesystem.rm).not.toHaveBeenCalled()
    },
  )

  it("bounds Windows retries and cleans only the temporary file on exhaustion", async () => {
    const f = fixture()
    const error = Object.assign(new Error("locked"), { code: "EPERM" })
    f.filesystem.rename.mockRejectedValue(error)
    await expect(createAtomicJsonWriter({ ...f, platform: "win32" })("/profile/settings.json", {})).rejects.toBe(error)
    expect(f.filesystem.rename).toHaveBeenCalledTimes(6)
    expect(f.wait.mock.calls.flat()).toEqual([25, 50, 75, 100, 125])
    expect(f.filesystem.rm).toHaveBeenCalledExactlyOnceWith(expect.stringContaining("settings.json.tmp-"), {
      force: true,
    })
  })

  it.each([
    ["darwin", "EPERM"],
    ["win32", "ENOSPC"],
  ])("propagates %s/%s immediately", async (platform, code) => {
    const f = fixture()
    const error = Object.assign(new Error("failed"), { code })
    f.filesystem.rename.mockRejectedValue(error)
    await expect(createAtomicJsonWriter({ ...f, platform })("/profile/settings.json", {})).rejects.toBe(error)
    expect(f.filesystem.rename).toHaveBeenCalledTimes(1)
    expect(f.wait).not.toHaveBeenCalled()
  })
})
