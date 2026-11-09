import fs from "fs"
import os from "os"
import path from "path"
import { afterEach, beforeEach, expect, it, vi } from "vitest"

import { readBoundedRegularFile } from "./read-bounded-file.js"

let directory
beforeEach(async () => {
  directory = await fs.promises.mkdtemp(path.join(os.tmpdir(), "bounded-read-"))
})
afterEach(async () => {
  vi.restoreAllMocks()
  await fs.promises.rm(directory, { recursive: true, force: true })
})

it("reads regular files within the byte cap, including empty files", async () => {
  const file = path.join(directory, "content")
  await fs.promises.writeFile(file, "hello")
  expect(await readBoundedRegularFile(file, { maxBytes: 5, root: directory })).toEqual(Buffer.from("hello"))
  await expect(readBoundedRegularFile(file, { maxBytes: 4 })).rejects.toMatchObject({ code: "FILE_TOO_LARGE" })
  await fs.promises.writeFile(file, "")
  expect(await readBoundedRegularFile(file, { maxBytes: 0 })).toEqual(Buffer.alloc(0))
})

it("refuses a different regular file substituted after lstat", async () => {
  const file = path.join(directory, "content")
  const replacement = path.join(directory, "replacement")
  await fs.promises.writeFile(file, "public")
  await fs.promises.writeFile(replacement, "private")
  const lstat = fs.promises.lstat.bind(fs.promises)
  vi.spyOn(fs.promises, "lstat").mockImplementation(async (...args) => {
    const entry = await lstat(...args)
    if (args[0] === file) await fs.promises.rename(replacement, file)
    return entry
  })
  await expect(readBoundedRegularFile(file, { maxBytes: 100 })).rejects.toMatchObject({ code: "FILE_CHANGED" })
})

it("bounds reads if a file grows after its handle was checked and closes that handle", async () => {
  const file = path.join(directory, "content")
  await fs.promises.writeFile(file, "small")
  const open = fs.promises.open.bind(fs.promises)
  let close
  vi.spyOn(fs.promises, "open").mockImplementation(async (...args) => {
    const handle = await open(...args)
    const stat = handle.stat.bind(handle)
    vi.spyOn(handle, "stat").mockImplementation(async () => {
      const entry = await stat()
      // Use the original open to avoid reentering the injected race.
      const writer = await open(file, "a")
      await writer.write("more content than the cap")
      await writer.close()
      return entry
    })
    close = vi.spyOn(handle, "close")
    return handle
  })
  await expect(readBoundedRegularFile(file, { maxBytes: 10 })).rejects.toMatchObject({ code: "FILE_CHANGED" })
  expect(close).toHaveBeenCalledOnce()
})

it("refuses a path outside the specified root", async () => {
  const root = path.join(directory, "root")
  await fs.promises.mkdir(root)
  const outside = path.join(directory, "private")
  await fs.promises.writeFile(outside, "private")
  await expect(readBoundedRegularFile(outside, { maxBytes: 100, root })).rejects.toMatchObject({ code: "OUTSIDE_ROOT" })
})

it("refuses directories instead of reading them", async () => {
  await expect(readBoundedRegularFile(directory, { maxBytes: 100 })).rejects.toMatchObject({ code: "NOT_REGULAR_FILE" })
})
