import * as fs from "node:fs/promises"
import os from "node:os"
import path from "node:path"
import { afterEach, describe, expect, it, vi } from "vitest"

import { registerFsRoutes } from "./routes.js"
import { createMockResponse, createRouteRegistry } from "../../test-helpers/route-harness.js"

const temporaryDirectories = []

afterEach(async () => {
  await Promise.all(temporaryDirectories.splice(0).map((directory) => fs.rm(directory, { recursive: true, force: true })))
})

async function createFixture(name = "file.txt") {
  const directory = await fs.realpath(await fs.mkdtemp(path.join(os.tmpdir(), "ax-code-write-")))
  temporaryDirectories.push(directory)
  const filename = path.join(directory, name)
  await fs.writeFile(filename, "original contents")
  return { directory, filename }
}

function registerWrite(directory, fsPromises = fs) {
  const { app, getRoute } = createRouteRegistry()
  registerFsRoutes(app, {
    os,
    path,
    fsPromises,
    spawn: vi.fn(),
    crypto: { randomUUID: () => "test" },
    normalizeDirectoryPath: (value) => value,
    resolveProjectDirectory: async () => ({ directory }),
    readSettingsFromDiskMigrated: async () => ({ approvedDirectories: [] }),
    buildAugmentedPath: () => "",
    resolveGitBinaryForSpawn: () => "git",
    openchamberUserConfigRoot: path.join(directory, ".config"),
  })
  return getRoute("POST", "/api/fs/write")
}

async function save(handler, filename, content = "updated contents") {
  const response = createMockResponse()
  await handler({ body: { path: filename, content } }, response)
  return response
}

describe("fs atomic writes", () => {
  // POSIX component limits count bytes; the target is valid but leaves no room for a temporary-name suffix.
  it.skipIf(process.platform === "win32").each([
    ["ASCII", "a".repeat(251) + ".txt"],
    ["UTF-8", "é".repeat(120) + ".txt"],
  ])(
    "saves a valid long %s filename",
    async (_label, name) => {
      const { directory, filename } = await createFixture(name)

      const response = await save(registerWrite(directory), filename)

      expect(response.statusCode).toBe(200)
      expect(await fs.readFile(filename, "utf8")).toBe("updated contents")
      expect(await fs.readdir(directory)).toEqual([name])
    },
  )

  it.skipIf(process.platform === "win32").each([0o755, 0o640, 0o000])(
    "preserves existing file mode %i despite a restrictive umask",
    async (mode) => {
      const { directory, filename } = await createFixture()
      await fs.chmod(filename, mode)
      const originalUmask = process.umask(0o077)
      try {
        const response = await save(registerWrite(directory), filename)

        expect(response.statusCode).toBe(200)
        expect((await fs.stat(filename)).mode & 0o777).toBe(mode)
        await fs.chmod(filename, 0o600)
        expect(await fs.readFile(filename, "utf8")).toBe("updated contents")
        expect(await fs.readdir(directory)).toEqual(["file.txt"])
      } finally {
        process.umask(originalUmask)
      }
    },
  )

  it.skipIf(process.platform === "win32").each(["EACCES", "EIO"])(
    "preserves the original and removes the temporary file if mode restoration fails with %s",
    async (code) => {
      const { directory, filename } = await createFixture()
      const originalMode = (await fs.stat(filename)).mode & 0o777
      const io = {
        ...fs,
        chmod: vi.fn(async () => {
          throw Object.assign(new Error("Cannot preserve file mode"), { code })
        }),
      }

      const response = await save(registerWrite(directory, io), filename)

      expect(response.statusCode).toBe(code === "EACCES" ? 403 : 500)
      expect(await fs.readFile(filename, "utf8")).toBe("original contents")
      expect((await fs.stat(filename)).mode & 0o777).toBe(originalMode)
      expect(await fs.readdir(directory)).toEqual(["file.txt"])
    },
  )

  it.each(["EACCES", "EIO"])("preserves the original if metadata cannot be read: %s", async (code) => {
    const { directory, filename } = await createFixture()
    const io = {
      ...fs,
      stat: vi.fn(async () => {
        throw Object.assign(new Error("Cannot inspect existing file"), { code })
      }),
    }

    const response = await save(registerWrite(directory, io), filename)

    expect(response.statusCode).toBe(code === "EACCES" ? 403 : 500)
    expect(await fs.readFile(filename, "utf8")).toBe("original contents")
    expect(await fs.readdir(directory)).toEqual(["file.txt"])
  })

  it.skipIf(process.platform === "win32")("respects umask when creating a new file", async () => {
    const { directory } = await createFixture()
    const filename = path.join(directory, "new.txt")
    const originalUmask = process.umask(0o027)
    try {
      const response = await save(registerWrite(directory), filename)

      expect(response.statusCode).toBe(200)
      expect((await fs.stat(filename)).mode & 0o777).toBe(0o640)
      expect(await fs.readFile(filename, "utf8")).toBe("updated contents")
      expect((await fs.readdir(directory)).sort()).toEqual(["file.txt", "new.txt"])
    } finally {
      process.umask(originalUmask)
    }
  })

  const assertTemporaryCollision = async (kind) => {
    const { directory, filename } = await createFixture()
    const otherFile = path.join(directory, "other-owner.txt")
    await fs.writeFile(otherFile, "other owner's bytes")
    let temporaryPath
    const io = {
      ...fs,
      writeFile: async (target, content, options) => {
        temporaryPath = target
        if (kind === "symlink") await fs.symlink(otherFile, target)
        else await fs.writeFile(target, "other temporary bytes")
        return fs.writeFile(target, content, options)
      },
    }

    const response = await save(registerWrite(directory, io), filename)

    expect(response.statusCode).toBe(500)
    expect(await fs.readFile(filename, "utf8")).toBe("original contents")
    expect(await fs.readFile(otherFile, "utf8")).toBe("other owner's bytes")
    expect(await fs.readFile(temporaryPath, "utf8")).toBe(kind === "symlink" ? "other owner's bytes" : "other temporary bytes")
    expect((await fs.lstat(temporaryPath)).isSymbolicLink()).toBe(kind === "symlink")
  }

  it("refuses a temporary-name collision with a pre-existing file", () => assertTemporaryCollision("file"))
  it.skipIf(process.platform === "win32")("refuses a temporary-name collision with a pre-existing symlink", () =>
    assertTemporaryCollision("symlink"),
  )

  it("cleans a partial temporary write without replacing the original", async () => {
    const { directory, filename } = await createFixture()
    const io = {
      ...fs,
      writeFile: async (target, _content, options) => {
        await fs.writeFile(target, "partial bytes", options)
        throw Object.assign(new Error("Disk full"), { code: "ENOSPC" })
      },
    }

    const response = await save(registerWrite(directory, io), filename)

    expect(response.statusCode).toBe(500)
    expect(await fs.readFile(filename, "utf8")).toBe("original contents")
    expect(await fs.readdir(directory)).toEqual(["file.txt"])
  })

  it.each(["EIO", "EEXIST"])("preserves the original and cleans up when replacement fails: %s", async (code) => {
    const { directory, filename } = await createFixture()
    const originalMode = (await fs.stat(filename)).mode & 0o777
    const io = {
      ...fs,
      rename: vi.fn(async () => {
        throw Object.assign(new Error("Cannot replace existing file"), { code })
      }),
    }

    const response = await save(registerWrite(directory, io), filename)

    expect(response.statusCode).toBe(500)
    expect(await fs.readFile(filename, "utf8")).toBe("original contents")
    expect((await fs.stat(filename)).mode & 0o777).toBe(originalMode)
    expect(await fs.readdir(directory)).toEqual(["file.txt"])
  })

  it.each([false, true])("keeps simultaneous file saves independent when one write fails: %s", async (failFirst) => {
    const { directory, filename } = await createFixture()
    const secondFilename = path.join(directory, "second.txt")
    await fs.writeFile(secondFilename, "second original")
    const io = {
      ...fs,
      writeFile: async (target, content, options) => {
        if (failFirst && content === "first updated") {
          throw Object.assign(new Error("Write unavailable"), { code: "EIO" })
        }
        return fs.writeFile(target, content, options)
      },
    }
    const handler = registerWrite(directory, io)

    const [first, second] = await Promise.all([
      save(handler, filename, "first updated"),
      save(handler, secondFilename, "second updated"),
    ])

    expect(first.statusCode).toBe(failFirst ? 500 : 200)
    expect(second.statusCode).toBe(200)
    expect(await fs.readFile(filename, "utf8")).toBe(failFirst ? "original contents" : "first updated")
    expect(await fs.readFile(secondFilename, "utf8")).toBe("second updated")
    expect((await fs.readdir(directory)).sort()).toEqual(["file.txt", "second.txt"])
  })
})
