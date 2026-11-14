import fs from "node:fs/promises"
import os from "node:os"
import path from "node:path"
import { describe, expect, it, vi } from "vitest"
import { createAtomicJsonWriter } from "./atomic-json-writer.js"

function fixture() {
  const file = {
    writeFile: vi.fn().mockResolvedValue(undefined),
    close: vi.fn().mockResolvedValue(undefined),
  }
  const filesystem = {
    mkdir: vi.fn().mockResolvedValue(undefined),
    open: vi.fn().mockResolvedValue(file),
    rename: vi.fn().mockResolvedValue(undefined),
    rm: vi.fn().mockResolvedValue(undefined),
  }
  const wait = vi.fn().mockResolvedValue(undefined)
  return { filesystem, wait, file }
}

describe("atomic JSON replacement", () => {
  for (const kind of ["file", "symlink"]) {
    it.skipIf(kind === "symlink" && process.platform === "win32")(
      `preserves an occupied ${kind} temporary path and the last valid settings`,
      async () => {
        const dir = await fs.mkdtemp(path.join(os.tmpdir(), "atomic-json-collision-"))
        const now = vi.spyOn(Date, "now").mockReturnValue(123456789)
        const random = vi.spyOn(Math, "random").mockReturnValue(0.25)
        const file = path.join(dir, "settings.json")
        const temporary = `${file}.tmp-${process.pid}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
        const otherFile = path.join(dir, "other-writer.json")
        try {
          await fs.writeFile(file, '{"previous":true}')
          await fs.writeFile(otherFile, "other writer's content")
          if (kind === "symlink") await fs.symlink(otherFile, temporary)
          else await fs.writeFile(temporary, "occupied temporary file")

          await expect(createAtomicJsonWriter()(file, { next: true })).rejects.toMatchObject({ code: "EEXIST" })

          expect(await fs.readFile(file, "utf8")).toBe('{"previous":true}')
          expect(await fs.readFile(otherFile, "utf8")).toBe("other writer's content")
          if (kind === "symlink") expect(await fs.readlink(temporary)).toBe(otherFile)
          else expect(await fs.readFile(temporary, "utf8")).toBe("occupied temporary file")
        } finally {
          now.mockRestore()
          random.mockRestore()
          await fs.rm(dir, { recursive: true, force: true })
        }
      },
    )
  }

  it("does not remove an occupied temporary path when JSON serialization fails", async () => {
    const dir = await fs.mkdtemp(path.join(os.tmpdir(), "atomic-json-serialization-"))
    const now = vi.spyOn(Date, "now").mockReturnValue(123456789)
    const random = vi.spyOn(Math, "random").mockReturnValue(0.25)
    const file = path.join(dir, "settings.json")
    const temporary = `${file}.tmp-${process.pid}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
    const circular = {}
    circular.self = circular
    try {
      await fs.writeFile(file, '{"previous":true}')
      await fs.writeFile(temporary, "other writer's content")
      await expect(createAtomicJsonWriter()(file, circular)).rejects.toThrow()
      expect(await fs.readFile(file, "utf8")).toBe('{"previous":true}')
      expect(await fs.readFile(temporary, "utf8")).toBe("other writer's content")
    } finally {
      now.mockRestore()
      random.mockRestore()
      await fs.rm(dir, { recursive: true, force: true })
    }
  })

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
      expect(f.filesystem.open).toHaveBeenCalledExactlyOnceWith(
        expect.stringContaining("settings.json.tmp-"),
        "wx",
        0o600,
      )
      expect(f.file.writeFile).toHaveBeenCalledExactlyOnceWith(JSON.stringify({ projects: ["kept"] }, null, 2))
      expect(f.file.close).toHaveBeenCalledTimes(1)
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

  it("closes and removes its own partial file after a failed write", async () => {
    const f = fixture()
    const error = Object.assign(new Error("disk full"), { code: "ENOSPC" })
    f.file.writeFile.mockRejectedValue(error)
    await expect(createAtomicJsonWriter(f)("/profile/settings.json", {})).rejects.toBe(error)
    expect(f.file.close).toHaveBeenCalledTimes(1)
    expect(f.filesystem.rename).not.toHaveBeenCalled()
    expect(f.filesystem.rm).toHaveBeenCalledExactlyOnceWith(expect.stringContaining("settings.json.tmp-"), {
      force: true,
    })
    expect(f.file.close.mock.invocationCallOrder[0]).toBeLessThan(f.filesystem.rm.mock.invocationCallOrder[0])
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
