import fs from "node:fs/promises"
import os from "node:os"
import path from "node:path"
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
  it.skipIf(process.platform === "win32")("writes the file owner-only, replacing a readable one", async () => {
    // Settings carry the UI password hash, and the default umask left the file readable by other accounts.
    const dir = await fs.mkdtemp(path.join(os.tmpdir(), "atomic-json-writer-"))
    try {
      const file = path.join(dir, "settings.json")
      await fs.writeFile(file, "{}", { mode: 0o644 })
      await createAtomicJsonWriter()(file, { secret: "hash" })
      expect((await fs.stat(file)).mode & 0o777).toBe(0o600)
      expect(JSON.parse(await fs.readFile(file, "utf8"))).toEqual({ secret: "hash" })
    } finally {
      await fs.rm(dir, { recursive: true, force: true })
    }
  })

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
        { mode: 0o600 },
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
