import fs from "node:fs/promises"
import os from "node:os"
import path from "node:path"
import { createRequire } from "node:module"
import { afterEach, describe, expect, test } from "vitest"

const { readOpenFileUpTo } = createRequire(import.meta.url)("./read-open-file.js")

describe("bounded open-file reads", () => {
  let dir
  afterEach(async () => {
    if (dir) await fs.rm(dir, { recursive: true, force: true })
    dir = undefined
  })

  test("stops at the approved size even when the file has grown since", async () => {
    dir = await fs.mkdtemp(path.join(os.tmpdir(), "read-open-file-"))
    const file = path.join(dir, "growing.log")
    await fs.writeFile(file, "0123456789")
    const handle = await fs.open(file, "r")
    try {
      const { size } = await handle.stat()
      await fs.appendFile(file, "appended after the size check")
      const bytes = await readOpenFileUpTo(handle, size)
      expect(bytes.toString("utf8")).toBe("0123456789")
    } finally {
      await handle.close()
    }
  })

  test("returns only what exists when the file shrank", async () => {
    dir = await fs.mkdtemp(path.join(os.tmpdir(), "read-open-file-"))
    const file = path.join(dir, "short.txt")
    await fs.writeFile(file, "abc")
    const handle = await fs.open(file, "r")
    try {
      expect((await readOpenFileUpTo(handle, 10)).toString("utf8")).toBe("abc")
      expect((await readOpenFileUpTo(handle, 0)).length).toBe(0)
    } finally {
      await handle.close()
    }
  })
})
