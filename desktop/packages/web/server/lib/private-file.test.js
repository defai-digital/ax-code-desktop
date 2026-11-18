import fs from "fs"
import os from "os"
import path from "path"
import { expect, it, vi } from "vitest"
import { writePrivateFileSync } from "./private-file.js"

it("preserves the previous file after a flush failure and allows a retry", () => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), "ax-private-file-"))
  const target = path.join(directory, "record")
  try {
    fs.writeFileSync(target, "original")
    const failure = new Error("flush failed")
    vi.spyOn(fs, "fsyncSync").mockImplementationOnce(() => { throw failure })

    expect(() => writePrivateFileSync(target, "replacement")).toThrow(failure)
    expect(fs.readdirSync(directory)).toEqual(["record"])
    expect(fs.readFileSync(target, "utf8")).toBe("original")

    writePrivateFileSync(target, "replacement")
    expect(fs.readFileSync(target, "utf8")).toBe("replacement")
    if (process.platform !== "win32") expect(fs.statSync(target).mode & 0o777).toBe(0o600)
  } finally {
    vi.restoreAllMocks()
    fs.rmSync(directory, { recursive: true, force: true })
  }
})
