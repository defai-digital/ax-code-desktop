import { EventEmitter } from "events"
import { validateHeaderValue } from "node:http"
import path from "path"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import {
  deriveCloneDirectoryName,
  isPathWithinRoot,
  isPlansDirectoryPath,
  isSafeClonePathComponent,
  registerFsRoutes,
} from "./routes.js"
import { createMockResponse, createRouteRegistry } from "../../test-helpers/route-harness.js"

// Fake child process: emits the configured stdout then closes with the given code.
const createSpawn = ({ stdoutByCommand = {}, exitCode = 0 } = {}) => {
  const calls = []
  const spawn = vi.fn((executable, args) => {
    const command = [executable, ...args].join(" ")
    calls.push(command)
    const child = new EventEmitter()
    child.stdout = new EventEmitter()
    child.stderr = new EventEmitter()
    child.kill = () => {}
    queueMicrotask(() => {
      const out = stdoutByCommand[command]
      if (out) child.stdout.emit("data", Buffer.from(out))
      child.emit("close", exitCode, null)
    })
    return child
  })
  return { spawn, calls }
}

// Fake detached helper process (open/xdg-open) that spawns successfully, or fails with `error`.
const createDetachedChild = ({ error } = {}) => {
  const child = new EventEmitter()
  child.unref = vi.fn()
  queueMicrotask(() => (error ? child.emit("error", error) : child.emit("spawn")))
  return child
}

const createDeferredSpawn = ({ stdoutByCommand = {}, exitCode = 0 } = {}) => {
  const calls = []
  const pending = []
  const spawn = vi.fn((executable, args) => {
    const command = [executable, ...args].join(" ")
    calls.push(command)
    const child = new EventEmitter()
    child.stdout = new EventEmitter()
    child.stderr = new EventEmitter()
    child.kill = () => {}
    pending.push({ child, command })
    return child
  })
  const closeNext = () => {
    const entry = pending.shift()
    if (!entry) return
    const out = stdoutByCommand[entry.command]
    if (out) entry.child.stdout.emit("data", Buffer.from(out))
    entry.child.emit("close", exitCode, null)
  }
  return { spawn, calls, closeNext }
}

const registerExec = ({ spawn }) => {
  const { app, getRoute } = createRouteRegistry()
  registerFsRoutes(app, {
    os: { homedir: () => "/home/user" },
    path,
    fsPromises: {
      realpath: async (targetPath) => targetPath,
      stat: async () => ({ isDirectory: () => true }),
    },
    spawn,
    crypto: {
      randomUUID: (() => {
        let n = 0
        return () => `job-${n++}`
      })(),
    },
    normalizeDirectoryPath: (p) => p,
    resolveProjectDirectory: async () => ({ directory: "/repo" }),
    readSettingsFromDiskMigrated: async () => ({ approvedDirectories: ["/"] }),
    buildAugmentedPath: () => "/usr/bin",
    resolveGitBinaryForSpawn: () => "git",
    openchamberUserConfigRoot: "/home/user/.config",
  })
  return getRoute("POST", "/api/fs/exec")
}

describe("fs route helpers", () => {
  it("keeps sibling paths whose name starts with dots inside the root", () => {
    expect(isPathWithinRoot("/repo/src/a.ts", "/repo", path, { homedir: () => "/home/user" })).toBe(true)
    expect(isPathWithinRoot("/repo", "/repo", path, { homedir: () => "/home/user" })).toBe(true)
    // "..cache" is a legitimate sibling name; only ".." itself or "../" leaves the root.
    expect(isPathWithinRoot("/repo/..cache", "/repo", path, { homedir: () => "/home/user" })).toBe(true)
    expect(isPathWithinRoot("/repo/..cache/a.ts", "/repo", path, { homedir: () => "/home/user" })).toBe(true)
    expect(isPathWithinRoot("/elsewhere/a.ts", "/repo", path, { homedir: () => "/home/user" })).toBe(false)
    expect(isPathWithinRoot("/repo/../elsewhere/a.ts", "/repo", path, { homedir: () => "/home/user" })).toBe(false)
    expect(isPathWithinRoot("/repo/..", "/repo", path, { homedir: () => "/home/user" })).toBe(false)
  })

  it("derives clone directory names without input-driven regular expressions", () => {
    expect(deriveCloneDirectoryName("https://github.com/acme/demo.git")).toBe("demo")
    expect(deriveCloneDirectoryName("git@github.com:acme/demo.git/")).toBe("demo")
    expect(deriveCloneDirectoryName("ssh://git@example.com:2222/acme/demo#main")).toBe("demo")
    expect(deriveCloneDirectoryName("")).toBe("")
  })

  it("accepts only a single path component as a clone directory name", () => {
    // A Windows backslash survives deriveCloneDirectoryName (it slices at the
    // last "/" or ":"), and path.join would then climb out of the authorized
    // parent: path.win32.join("C:\\repo", "foo\\..\\..\\evil") === "C:\\evil".
    expect(deriveCloneDirectoryName(String.raw`https://example.com/foo\..\..\evil`)).toBe(String.raw`foo\..\..\evil`)
    expect(isSafeClonePathComponent(String.raw`foo\..\..\evil`)).toBe(false)
    expect(isSafeClonePathComponent("a/b")).toBe(false)
    expect(isSafeClonePathComponent("C:evil")).toBe(false)
    expect(isSafeClonePathComponent("..")).toBe(false)
    expect(isSafeClonePathComponent(".")).toBe(false)
    expect(isSafeClonePathComponent("")).toBe(false)
    expect(isSafeClonePathComponent("demo")).toBe(true)
    expect(isSafeClonePathComponent("my repo.git")).toBe(true)
  })

  it("detects plans directories with slash normalization", () => {
    expect(isPlansDirectoryPath(String.raw`C:\repo\.opencode\plans\\`)).toBe(true)
    expect(isPlansDirectoryPath("/repo/.opencode/plans///")).toBe(true)
    expect(isPlansDirectoryPath("/repo/.opencode/plans-old")).toBe(false)
  })
})

const registerWrite = (fsPromises, settings = { approvedDirectories: [] }) => {
  const { app, getRoute } = createRouteRegistry()
  registerFsRoutes(app, {
    os: { homedir: () => "/home/user" },
    path: path.posix,
    fsPromises: {
      realpath: async (targetPath) => targetPath,
      ...fsPromises,
    },
    spawn: vi.fn(),
    crypto: { randomUUID: () => "job-0" },
    normalizeDirectoryPath: (p) => p,
    resolveProjectDirectory: async () => ({ directory: "/repo" }),
    readSettingsFromDiskMigrated: async () => settings,
    buildAugmentedPath: () => "/usr/bin",
    resolveGitBinaryForSpawn: () => "git",
    openchamberUserConfigRoot: "/home/user/.config",
  })
  return getRoute("POST", "/api/fs/write")
}

const callExec = async (handler, body) => {
  const res = createMockResponse()
  await handler({ body }, res)
  return res
}

const callWrite = async (handler, body) => {
  const res = createMockResponse()
  await handler({ body }, res)
  return res
}

const registerFs = (fsPromises, settings = { approvedDirectories: [] }, coreFileAdapter, spawn = vi.fn()) => {
  const { app, getRoute } = createRouteRegistry()
  registerFsRoutes(app, {
    os: { homedir: () => "/home/user" },
    path: path.posix,
    fsPromises: {
      realpath: async (targetPath) => targetPath,
      ...fsPromises,
    },
    spawn,
    crypto: { randomUUID: () => "job-0" },
    normalizeDirectoryPath: (p) => p,
    resolveProjectDirectory: async () => ({ directory: "/repo" }),
    readSettingsFromDiskMigrated: async () => settings,
    buildAugmentedPath: () => "/usr/bin",
    resolveGitBinaryForSpawn: () => "git",
    openchamberUserConfigRoot: "/home/user/.config",
    coreFileAdapter,
  })
  return { getRoute }
}

const callRoute = async (handler, req = {}) => {
  const res = createMockResponse()
  await handler({ query: {}, body: {}, ...req }, res)
  return res
}

describe("fs write", () => {
  it("does not rewrite a file when content is unchanged", async () => {
    const fsPromises = {
      readFile: vi.fn(async () => "same"),
      mkdir: vi.fn(async () => undefined),
      writeFile: vi.fn(async () => undefined),
    }
    const handler = registerWrite(fsPromises)

    const res = await callWrite(handler, { path: "/repo/file.txt", content: "same" })

    expect(res.body).toEqual({ success: true, path: "/repo/file.txt" })
    expect(fsPromises.writeFile).not.toHaveBeenCalled()
  })

  it("writes a file when content changed", async () => {
    const fsPromises = {
      readFile: vi.fn(async () => "old"),
      mkdir: vi.fn(async () => undefined),
      writeFile: vi.fn(async () => undefined),
    }
    const handler = registerWrite(fsPromises)

    const res = await callWrite(handler, { path: "/repo/file.txt", content: "new" })

    expect(res.body).toEqual({ success: true, path: "/repo/file.txt" })
    expect(fsPromises.mkdir).toHaveBeenCalledWith("/repo", { recursive: true })
    expect(fsPromises.writeFile).toHaveBeenCalledWith("/repo/file.txt", "new", "utf8")
  })

  it("writes to the canonical target the containment check resolved, not the requested string", async () => {
    // The check resolves through realpath; acting on the raw path afterwards
    // would follow a component that became a symlink between the check and the
    // write. Mirrors the delete route's contract.
    const fsPromises = {
      realpath: vi.fn(async (targetPath) => {
        if (targetPath === "/repo/link/file.txt") return "/repo/real/file.txt"
        return targetPath
      }),
      readFile: vi.fn(async () => "old"),
      mkdir: vi.fn(async () => undefined),
      writeFile: vi.fn(async () => undefined),
    }
    const handler = registerWrite(fsPromises)

    const res = await callWrite(handler, { path: "/repo/link/file.txt", content: "new" })

    expect(res.body).toEqual({ success: true, path: "/repo/real/file.txt" })
    expect(fsPromises.mkdir).toHaveBeenCalledWith("/repo/real", { recursive: true })
    expect(fsPromises.writeFile).toHaveBeenCalledWith("/repo/real/file.txt", "new", "utf8")
  })

  it("allows writes inside an approved outside-workspace directory when explicitly requested", async () => {
    const fsPromises = {
      readFile: vi.fn(async () => "old"),
      mkdir: vi.fn(async () => undefined),
      writeFile: vi.fn(async () => undefined),
    }
    const handler = registerWrite(fsPromises, { approvedDirectories: ["/tmp/approved"] })

    const res = await callWrite(handler, {
      path: "/tmp/approved/file.txt",
      content: "new",
      allowOutsideWorkspace: true,
    })

    expect(res.statusCode).toBe(200)
    expect(res.body).toEqual({ success: true, path: "/tmp/approved/file.txt" })
    expect(fsPromises.mkdir).toHaveBeenCalledWith("/tmp/approved", { recursive: true })
    expect(fsPromises.writeFile).toHaveBeenCalledWith("/tmp/approved/file.txt", "new", "utf8")
  })
})

describe("fs outside workspace authorization", () => {
  it("rejects allowOutsideWorkspace reads outside approved directories", async () => {
    const { getRoute } = registerFs({
      stat: vi.fn(async () => ({ isFile: () => true })),
      readFile: vi.fn(async () => "secret"),
    })

    const res = await callRoute(getRoute("GET", "/api/fs/read"), {
      query: { path: "/tmp/secret.txt", allowOutsideWorkspace: "true" },
    })

    expect(res.statusCode).toBe(400)
    expect(res.body).toEqual({ error: "Path is outside of approved directories" })
  })

  it("allows outside-workspace reads inside an approved directory", async () => {
    const coreFileAdapter = {
      read: vi.fn(async () => "approved"),
      raw: vi.fn(),
      list: vi.fn(async () => []),
    }
    const fsPromises = {
      stat: vi.fn(async () => ({ isDirectory: () => false })),
      open: vi.fn(async () => {
        throw new Error("must not open")
      }),
    }
    const { getRoute } = registerFs(fsPromises, { approvedDirectories: ["/tmp/approved"] }, coreFileAdapter)

    const res = await callRoute(getRoute("GET", "/api/fs/read"), {
      query: { path: "/tmp/approved/file.txt", allowOutsideWorkspace: "true" },
    })

    expect(res.statusCode).toBe(200)
    expect(res.sent).toBe("approved")
    expect(fsPromises.open).not.toHaveBeenCalled()
  })

  it("allows raw outside-workspace reads inside an approved directory", async () => {
    const content = Buffer.from("approved image")
    const coreFileAdapter = {
      raw: vi.fn(async () => ({ buffer: content, mimeType: "image/png" })),
    }
    const fsPromises = {
      stat: vi.fn(async () => ({ isDirectory: () => false })),
      open: vi.fn(async () => {
        throw new Error("must not open")
      }),
    }
    const { getRoute } = registerFs(fsPromises, { approvedDirectories: ["/tmp/approved"] }, coreFileAdapter)

    const res = await callRoute(getRoute("GET", "/api/fs/raw"), {
      query: { path: "/tmp/approved/image.png", allowOutsideWorkspace: "true" },
    })

    expect(res.statusCode).toBe(200)
    expect(res.contentType).toBe("image/png")
    expect(res.sent).toEqual(content)
    expect(fsPromises.open).not.toHaveBeenCalled()
  })

  it("rejects directory listing through a workspace symlink that resolves outside the workspace", async () => {
    const fsPromises = {
      realpath: vi.fn(async (targetPath) => {
        if (targetPath === "/repo/link") return "/outside"
        if (targetPath === "/repo") return "/repo"
        return targetPath
      }),
      stat: vi.fn(async () => ({ isDirectory: () => true })),
      readdir: vi.fn(async () => []),
    }
    const { getRoute } = registerFs(fsPromises)

    const res = await callRoute(getRoute("GET", "/api/fs/list"), {
      query: { path: "/repo/link" },
    })

    expect(res.statusCode).toBe(403)
    expect(res.body).toEqual({ error: "Access to path denied" })
    expect(fsPromises.readdir).not.toHaveBeenCalled()
  })

  it("rejects writes through a workspace symlink that resolves outside the workspace", async () => {
    const fsPromises = {
      realpath: vi.fn(async (targetPath) => {
        if (targetPath === "/repo/link/file.txt") return "/outside/file.txt"
        if (targetPath === "/repo") return "/repo"
        return targetPath
      }),
      readFile: vi.fn(async () => "old"),
      mkdir: vi.fn(async () => undefined),
      writeFile: vi.fn(async () => undefined),
    }
    const handler = registerWrite(fsPromises)

    const res = await callWrite(handler, { path: "/repo/link/file.txt", content: "new" })

    expect(res.statusCode).toBe(403)
    expect(res.body).toEqual({ error: "Access to path denied" })
    expect(fsPromises.writeFile).not.toHaveBeenCalled()
  })

  it("rejects a write whose target is a dangling symlink", async () => {
    // realpath() reports ENOENT for a symlink whose target does not exist yet, so the
    // parent check alone passed and the write created the file wherever it pointed.
    const fsPromises = {
      realpath: vi.fn(async (targetPath) => {
        if (targetPath === "/repo/notes") {
          const error = new Error("ENOENT")
          error.code = "ENOENT"
          throw error
        }
        return targetPath
      }),
      lstat: vi.fn(async () => ({ isSymbolicLink: () => true })),
      readFile: vi.fn(async () => "old"),
      mkdir: vi.fn(async () => undefined),
      writeFile: vi.fn(async () => undefined),
    }
    const handler = registerWrite(fsPromises)

    const res = await callWrite(handler, { path: "/repo/notes", content: "new" })

    expect(res.statusCode).toBe(403)
    expect(res.body).toEqual({ error: "Access to path denied" })
    expect(fsPromises.writeFile).not.toHaveBeenCalled()
  })

  it("rejects mkdir outside workspace when the directory was not approved", async () => {
    const fsPromises = {
      mkdir: vi.fn(async () => undefined),
    }
    const { getRoute } = registerFs(fsPromises)

    const res = await callRoute(getRoute("POST", "/api/fs/mkdir"), {
      body: { path: "/tmp/new-project", allowOutsideWorkspace: true },
    })

    expect(res.statusCode).toBe(400)
    expect(res.body).toEqual({ error: "Path is outside of approved directories" })
    expect(fsPromises.mkdir).not.toHaveBeenCalled()
  })
})

describe("fs clone destination", () => {
  it("refuses a URL-derived name that is not a single path component", async () => {
    // On Windows the backslashes are separators, so this name would clone into
    // C:\evil instead of below the authorized parent.
    const fsPromises = {
      mkdir: vi.fn(async () => undefined),
      access: vi.fn(async () => undefined),
    }
    const { getRoute } = registerFs(fsPromises)

    const res = await callRoute(getRoute("POST", "/api/fs/clone"), {
      body: { remoteUrl: String.raw`https://example.com/foo\..\..\evil`, destinationPath: "/repo/sub/" },
    })

    expect(res.statusCode).toBe(400)
    expect(res.body).toEqual({ error: "Invalid repository directory name" })
    expect(fsPromises.mkdir).not.toHaveBeenCalled()
  })

  it("clones a well-formed URL into the destination directory", async () => {
    const { spawn, calls } = createSpawn({})
    const fsPromises = {
      mkdir: vi.fn(async () => undefined),
      access: vi.fn(async () => {
        const error = new Error("ENOENT")
        error.code = "ENOENT"
        throw error
      }),
    }
    const { getRoute } = registerFs(fsPromises, { approvedDirectories: [] }, undefined, spawn)

    const res = await callRoute(getRoute("POST", "/api/fs/clone"), {
      body: { remoteUrl: "https://example.com/acme/demo.git", destinationPath: "/repo/sub/" },
    })

    expect(res.statusCode).toBe(200)
    expect(calls[0]).toBe("git clone -- https://example.com/acme/demo.git demo")
  })
})

describe("fs reveal authorization", () => {
  it("rejects reveal for paths outside workspace and approved directories", async () => {
    const { getRoute } = registerFs({
      access: vi.fn(async () => undefined),
      stat: vi.fn(async () => ({ isDirectory: () => false })),
    })

    const res = await callRoute(getRoute("POST", "/api/fs/reveal"), {
      body: { path: "/etc/passwd" },
    })

    expect(res.statusCode).toBe(400)
    expect(res.body.error).toMatch(/outside/)
  })

  it("allows reveal for paths inside the workspace", async () => {
    const spawnMock = vi.fn(() => createDetachedChild())
    const { app, getRoute } = createRouteRegistry()
    registerFsRoutes(app, {
      os: { homedir: () => "/home/user" },
      path: path.posix,
      fsPromises: {
        realpath: async (p) => p,
        access: vi.fn(async () => undefined),
        stat: vi.fn(async () => ({ isDirectory: () => false })),
      },
      spawn: spawnMock,
      crypto: { randomUUID: () => "job-0" },
      normalizeDirectoryPath: (p) => p,
      resolveProjectDirectory: async () => ({ directory: "/repo" }),
      readSettingsFromDiskMigrated: async () => ({ approvedDirectories: [] }),
      buildAugmentedPath: () => "/usr/bin",
      resolveGitBinaryForSpawn: () => "git",
      openchamberUserConfigRoot: "/home/user/.config",
    })

    const res = await callRoute(getRoute("POST", "/api/fs/reveal"), {
      body: { path: "/repo/file.txt" },
    })

    expect(res.statusCode).toBe(200)
    expect(res.body).toEqual({ success: true, path: "/repo/file.txt" })
  })

  it("returns an error instead of crashing when the reveal helper cannot be launched", async () => {
    const originalPlatform = Object.getOwnPropertyDescriptor(process, "platform")
    Object.defineProperty(process, "platform", { value: "linux" })
    const launchError = Object.assign(new Error("spawn xdg-open ENOENT"), { code: "ENOENT" })
    const spawnMock = vi.fn(() => createDetachedChild({ error: launchError }))
    const { app, getRoute } = createRouteRegistry()
    registerFsRoutes(app, {
      os: { homedir: () => "/home/user" },
      path: path.posix,
      fsPromises: {
        realpath: async (p) => p,
        access: vi.fn(async () => undefined),
        stat: vi.fn(async () => ({ isDirectory: () => false })),
      },
      spawn: spawnMock,
      crypto: { randomUUID: () => "job-0" },
      normalizeDirectoryPath: (p) => p,
      resolveProjectDirectory: async () => ({ directory: "/repo" }),
      readSettingsFromDiskMigrated: async () => ({ approvedDirectories: [] }),
      buildAugmentedPath: () => "/usr/bin",
      resolveGitBinaryForSpawn: () => "git",
      openchamberUserConfigRoot: "/home/user/.config",
    })

    try {
      const res = await callRoute(getRoute("POST", "/api/fs/reveal"), {
        body: { path: "/repo/file.txt" },
      })

      expect(res.statusCode).toBe(500)
      expect(res.body.error).toMatch(/Failed to launch xdg-open/)
    } finally {
      if (originalPlatform) Object.defineProperty(process, "platform", originalPlatform)
    }
  })

  it("allows reveal for paths inside approved directories", async () => {
    const spawnMock = vi.fn(() => createDetachedChild())
    const { app, getRoute } = createRouteRegistry()
    registerFsRoutes(app, {
      os: { homedir: () => "/home/user" },
      path: path.posix,
      fsPromises: {
        realpath: async (p) => p,
        access: vi.fn(async () => undefined),
        stat: vi.fn(async () => ({ isDirectory: () => true })),
      },
      spawn: spawnMock,
      crypto: { randomUUID: () => "job-0" },
      normalizeDirectoryPath: (p) => p,
      resolveProjectDirectory: async () => ({ directory: "/repo" }),
      readSettingsFromDiskMigrated: async () => ({ approvedDirectories: ["/approved"] }),
      buildAugmentedPath: () => "/usr/bin",
      resolveGitBinaryForSpawn: () => "git",
      openchamberUserConfigRoot: "/home/user/.config",
    })

    const res = await callRoute(getRoute("POST", "/api/fs/reveal"), {
      body: { path: "/approved/folder" },
    })

    expect(res.statusCode).toBe(200)
    expect(res.body).toEqual({ success: true, path: "/approved/folder" })
  })

  it("reveals Windows files through explorer argv without powershell", async () => {
    const originalPlatform = Object.getOwnPropertyDescriptor(process, "platform")
    Object.defineProperty(process, "platform", { value: "win32" })
    try {
      const spawnMock = vi.fn(() => {
        const child = new EventEmitter()
        queueMicrotask(() => child.emit("exit", 0))
        return child
      })
      const { app, getRoute } = createRouteRegistry()
      registerFsRoutes(app, {
        os: { homedir: () => "C:\\Users\\user" },
        path: path.win32,
        fsPromises: {
          realpath: async (p) => p,
          access: vi.fn(async () => undefined),
          stat: vi.fn(async () => ({ isDirectory: () => false })),
        },
        spawn: spawnMock,
        crypto: { randomUUID: () => "job-0" },
        normalizeDirectoryPath: (p) => p,
        resolveProjectDirectory: async () => ({ directory: "C:\\repo" }),
        readSettingsFromDiskMigrated: async () => ({ approvedDirectories: [] }),
        buildAugmentedPath: () => "C:\\Windows\\System32",
        resolveGitBinaryForSpawn: () => "git",
        openchamberUserConfigRoot: "C:\\Users\\user\\AppData\\Roaming\\ax-code",
      })

      const res = await callRoute(getRoute("POST", "/api/fs/reveal"), {
        body: { path: "C:\\repo\\file.txt" },
      })

      expect(res.statusCode).toBe(200)
      expect(spawnMock).toHaveBeenCalledWith("explorer.exe", ["/select,C:\\repo\\file.txt"], {
        windowsHide: true,
        stdio: "ignore",
      })
    } finally {
      if (originalPlatform) Object.defineProperty(process, "platform", originalPlatform)
    }
  })
})

describe("fs exec git-read cache", () => {
  beforeEach(() => {
    delete process.env.AX_CODE_DESKTOP_GIT_READ_CACHE_TTL_MS
  })

  afterEach(() => {
    delete process.env.AX_CODE_DESKTOP_GIT_READ_CACHE_TTL_MS
  })

  it("caches an allowlisted git rev-parse across identical requests", async () => {
    const command = "git rev-parse --absolute-git-dir --git-common-dir"
    const { spawn, calls } = createSpawn({ stdoutByCommand: { [command]: "/repo/.git\n.git\n" } })
    const handler = registerExec({ spawn })

    const first = await callExec(handler, { commands: [command], cwd: "/repo" })
    const second = await callExec(handler, { commands: [command], cwd: "/repo" })

    expect(first.body.results[0].stdout).toBe("/repo/.git\n.git")
    expect(second.body.results[0].stdout).toBe("/repo/.git\n.git")
    expect(second.body.success).toBe(true)
    // Spawned once; the second request is served from cache.
    expect(calls.length).toBe(1)
  })

  it("dedupes concurrent identical git-read requests while the first is in flight", async () => {
    const command = "git rev-parse --absolute-git-dir --git-common-dir"
    const { spawn, calls, closeNext } = createDeferredSpawn({ stdoutByCommand: { [command]: "/repo/.git\n.git\n" } })
    const handler = registerExec({ spawn })

    const first = callExec(handler, { commands: [command], cwd: "/repo" })
    const second = callExec(handler, { commands: [command], cwd: "/repo" })

    await new Promise((resolve) => setTimeout(resolve, 0))
    expect(calls.length).toBe(1)

    closeNext()
    const [firstRes, secondRes] = await Promise.all([first, second])

    expect(firstRes.body.results[0].stdout).toBe("/repo/.git\n.git")
    expect(secondRes.body.results[0].stdout).toBe("/repo/.git\n.git")
    expect(calls.length).toBe(1)
  })

  it("returns the current request command for normalized cache hits", async () => {
    const firstCommand = "git   rev-parse   --absolute-git-dir"
    const secondCommand = "git rev-parse --absolute-git-dir"
    const { spawn, calls } = createSpawn({ stdoutByCommand: { [secondCommand]: "/repo/.git\n" } })
    const handler = registerExec({ spawn })

    const first = await callExec(handler, { commands: [firstCommand], cwd: "/repo" })
    const second = await callExec(handler, { commands: [secondCommand], cwd: "/repo" })

    expect(first.body.results[0].command).toBe(firstCommand)
    expect(second.body.results[0].command).toBe(secondCommand)
    expect(calls.length).toBe(1)
  })

  it("keys the cache by working directory", async () => {
    const command = "git rev-parse --absolute-git-dir"
    const { spawn, calls } = createSpawn({ stdoutByCommand: { [command]: "/x/.git\n" } })
    const handler = registerExec({ spawn })

    await callExec(handler, { commands: [command], cwd: "/repo-a" })
    await callExec(handler, { commands: [command], cwd: "/repo-b" })

    expect(calls.length).toBe(2)
  })

  it("rejects non-allowlisted commands without spawning", async () => {
    const command = "git status"
    const { spawn, calls } = createSpawn({ stdoutByCommand: { [command]: "clean\n" } })
    const handler = registerExec({ spawn })

    const res = await callExec(handler, { commands: [command], cwd: "/repo" })

    expect(res.body.success).toBe(false)
    expect(res.body.results[0]).toMatchObject({
      command,
      success: false,
      error: "Unsupported command",
    })
    expect(calls.length).toBe(0)
  })

  it("does not cache failed git-read results", async () => {
    const command = "git rev-parse --absolute-git-dir"
    const { spawn, calls } = createSpawn({ stdoutByCommand: {}, exitCode: 128 })
    const handler = registerExec({ spawn })

    await callExec(handler, { commands: [command], cwd: "/not-a-repo" })
    await callExec(handler, { commands: [command], cwd: "/not-a-repo" })

    expect(calls.length).toBe(2)
  })

  it("disables caching when TTL is 0", async () => {
    process.env.AX_CODE_DESKTOP_GIT_READ_CACHE_TTL_MS = "0"
    const command = "git rev-parse --absolute-git-dir"
    const { spawn, calls } = createSpawn({ stdoutByCommand: { [command]: "/repo/.git\n" } })
    const handler = registerExec({ spawn })

    await callExec(handler, { commands: [command], cwd: "/repo" })
    await callExec(handler, { commands: [command], cwd: "/repo" })

    expect(calls.length).toBe(2)
  })

  it("re-runs once a cached entry ages past the TTL", async () => {
    vi.useFakeTimers()
    try {
      const command = "git rev-parse --absolute-git-dir"
      const { spawn, calls } = createSpawn({ stdoutByCommand: { [command]: "/repo/.git\n" } })
      const handler = registerExec({ spawn }) // default 30s TTL

      await callExec(handler, { commands: [command], cwd: "/repo" })
      vi.advanceTimersByTime(31_000)
      await callExec(handler, { commands: [command], cwd: "/repo" })

      // Stale entry is not served; a fresh subprocess fires.
      expect(calls.length).toBe(2)
    } finally {
      vi.useRealTimers()
    }
  })

  it("bounds the cache by evicting the least-recently-used entry past the count cap", async () => {
    const command = "git rev-parse --absolute-git-dir"
    const { spawn, calls } = createSpawn() // exit 0, empty stdout — still cacheable
    const handler = registerExec({ spawn })

    // Fill to the 500-entry ceiling with distinct working directories.
    for (let i = 0; i < 500; i += 1) {
      await callExec(handler, { commands: [command], cwd: `/repo-${i}` })
    }
    const afterFill = calls.length
    expect(afterFill).toBe(500)

    // One more distinct dir evicts the oldest entry (/repo-0).
    await callExec(handler, { commands: [command], cwd: "/repo-overflow" })
    // Evicted entry must re-run; a surviving entry must still be served.
    await callExec(handler, { commands: [command], cwd: "/repo-0" }) // evicted -> spawns
    await callExec(handler, { commands: [command], cwd: "/repo-499" }) // cached  -> no spawn

    expect(calls.length).toBe(afterFill + 2)
  })
})

describe("fs core file adapter responses", () => {
  it("answers a non-text read as a client error rather than a server fault", async () => {
    const coreFileAdapter = {
      read: vi.fn(async () => {
        const error = new Error("Specified path is not a text file")
        error.code = "EISDIR"
        throw error
      }),
    }
    const fsPromises = { stat: vi.fn(async () => ({ isDirectory: () => false })) }
    const { getRoute } = registerFs(fsPromises, { approvedDirectories: [] }, coreFileAdapter)

    const res = await callRoute(getRoute("GET", "/api/fs/read"), { query: { path: "/repo/src" } })

    expect(res.statusCode).toBe(400)
    expect(res.body).toEqual({ error: "Specified path is not a text file" })
  })

  it("names a directory when a non-text read really was a directory", async () => {
    const coreFileAdapter = {
      read: vi.fn(async () => {
        const error = new Error("Specified path is not a text file")
        error.code = "EISDIR"
        throw error
      }),
    }
    // The core reports a directory and a binary file the same way; the Files view needs the
    // directory wording to fall back to a listing instead of showing a read failure.
    const fsPromises = { stat: vi.fn(async () => ({ isDirectory: () => true })) }
    const { getRoute } = registerFs(fsPromises, { approvedDirectories: [] }, coreFileAdapter)

    const res = await callRoute(getRoute("GET", "/api/fs/read"), { query: { path: "/repo/src" } })

    expect(res.statusCode).toBe(400)
    expect(String(res.body.error)).toContain("is a directory")
  })

  it("keeps the adapter wording for a binary file", async () => {
    const coreFileAdapter = {
      read: vi.fn(async () => {
        const error = new Error("Specified path is not a text file")
        error.code = "EISDIR"
        throw error
      }),
    }
    const fsPromises = { stat: vi.fn(async () => ({ isDirectory: () => false })) }
    const { getRoute } = registerFs(fsPromises, { approvedDirectories: [] }, coreFileAdapter)

    const res = await callRoute(getRoute("GET", "/api/fs/read"), { query: { path: "/repo/logo.png" } })

    expect(res.statusCode).toBe(400)
    expect(res.body).toEqual({ error: "Specified path is not a text file" })
  })

  it("passes the extension MIME to the core adapter for raw reads", async () => {
    const content = Buffer.from("png-bytes")
    const coreFileAdapter = {
      raw: vi.fn(async () => ({ buffer: content, mimeType: "image/png" })),
    }
    const { getRoute } = registerFs(
      { stat: vi.fn(async () => ({ isDirectory: () => false })) },
      { approvedDirectories: [] },
      coreFileAdapter,
    )

    const res = await callRoute(getRoute("GET", "/api/fs/raw"), { query: { path: "/repo/logo.png" } })

    expect(res.statusCode).toBe(200)
    expect(coreFileAdapter.raw).toHaveBeenCalledWith({
      path: "/repo/logo.png",
      directory: "/repo",
      fallbackMime: "image/png",
    })
    expect(res.contentType).toContain("image/png")
  })

  it("answers a non-file raw read as a client error", async () => {
    const coreFileAdapter = {
      raw: vi.fn(async () => {
        const error = new Error("Specified path is not a file")
        error.code = "EISDIR"
        throw error
      }),
    }
    const { getRoute } = registerFs(
      { stat: vi.fn(async () => ({ isDirectory: () => false })) },
      { approvedDirectories: [] },
      coreFileAdapter,
    )

    const res = await callRoute(getRoute("GET", "/api/fs/raw"), { query: { path: "/repo/src" } })

    expect(res.statusCode).toBe(400)
    expect(res.body).toEqual({ error: "Specified path is not a file" })
  })

  it("answers a directory read without asking the core, so the Files view can list it", async () => {
    // The core reports a directory as a generic server fault with no errno, which
    // the route cannot classify; stating it here is what lets the view fall back
    // to a listing instead of showing a read failure.
    const coreFileAdapter = { read: vi.fn(), raw: vi.fn() }
    const { getRoute } = registerFs(
      { stat: vi.fn(async () => ({ isDirectory: () => true })) },
      { approvedDirectories: [] },
      coreFileAdapter,
    )

    const read = await callRoute(getRoute("GET", "/api/fs/read"), { query: { path: "/repo/src" } })
    expect(read.statusCode).toBe(400)
    expect(String(read.body.error)).toContain("is a directory")
    expect(coreFileAdapter.read).not.toHaveBeenCalled()

    const raw = await callRoute(getRoute("GET", "/api/fs/raw"), { query: { path: "/repo/src" } })
    expect(raw.statusCode).toBe(400)
    expect(raw.body).toEqual({ error: "Specified path is not a file" })
    expect(coreFileAdapter.raw).not.toHaveBeenCalled()
  })

  it("reports a missing path when deleting instead of claiming success", async () => {
    // `fs.rm` only reports ENOENT when `force` is not set, so the mock models that.
    const fsPromises = {
      rm: vi.fn(async (_target, options = {}) => {
        if (options.force) return
        const error = new Error("ENOENT: no such file or directory")
        error.code = "ENOENT"
        throw error
      }),
    }
    const { getRoute } = registerFs(fsPromises)

    const res = await callRoute(getRoute("POST", "/api/fs/delete"), { body: { path: "/repo/gone.txt" } })

    expect(res.statusCode).toBe(404)
    expect(res.body).toEqual({ error: "File or directory not found" })
    expect(fsPromises.rm).toHaveBeenCalledWith("/repo/gone.txt", { recursive: true })
  })

  it("deletes an existing path", async () => {
    const fsPromises = { rm: vi.fn(async () => undefined) }
    const { getRoute } = registerFs(fsPromises)

    const res = await callRoute(getRoute("POST", "/api/fs/delete"), { body: { path: "/repo/stale.txt" } })

    expect(res.statusCode).toBe(200)
    expect(res.body).toEqual({ success: true, path: "/repo/stale.txt" })
    expect(fsPromises.rm).toHaveBeenCalledWith("/repo/stale.txt", { recursive: true })
  })

  it("deletes through an intermediate symlink that the check resolved", async () => {
    // The check resolves through a cache, so acting on the raw path could follow a
    // component that turned into a symlink after the cached check.
    const fsPromises = {
      rm: vi.fn(async () => undefined),
      // A link at an intermediate component: both the link and everything through it resolve under
      // the real directory, as they would on disk.
      realpath: vi.fn(async (targetPath) =>
        targetPath === "/repo/link" || targetPath.startsWith("/repo/link/")
          ? `/repo/real${targetPath.slice("/repo/link".length)}`
          : targetPath,
      ),
    }
    const { getRoute } = registerFs(fsPromises)

    const res = await callRoute(getRoute("POST", "/api/fs/delete"), { body: { path: "/repo/link/notes.txt" } })

    expect(res.statusCode).toBe(200)
    expect(fsPromises.rm).toHaveBeenCalledWith("/repo/real/notes.txt", { recursive: true })
  })

  it("deletes a symlinked entry itself, not what it points at", async () => {
    // `realpath` resolves the entry, so removing its answer deleted the target and left the link
    // dangling: a link to a directory took the whole directory with it.
    const fsPromises = {
      rm: vi.fn(async () => undefined),
      realpath: vi.fn(async (targetPath) =>
        targetPath === "/repo/pointing.txt" ? "/repo/real/target.txt" : targetPath,
      ),
    }
    const { getRoute } = registerFs(fsPromises)

    const res = await callRoute(getRoute("POST", "/api/fs/delete"), { body: { path: "/repo/pointing.txt" } })

    expect(res.statusCode).toBe(200)
    expect(res.body).toEqual({ success: true, path: "/repo/pointing.txt" })
    expect(fsPromises.rm).toHaveBeenCalledWith("/repo/pointing.txt", { recursive: true })
  })

  it("stops answering with the miss it cached before the entry existed", async () => {
    // The cache stores a failed lookup for its failure TTL, so a directory that did not exist when
    // it was first listed stayed "not found" for 60 s after it was created.
    const existingPaths = new Set(["/repo"])
    const fsPromises = {
      mkdir: vi.fn(async (targetPath) => existingPaths.add(targetPath)),
      realpath: vi.fn(async (targetPath) => {
        if (!existingPaths.has(targetPath)) {
          throw Object.assign(new Error("ENOENT"), { code: "ENOENT" })
        }
        return targetPath
      }),
    }
    const { getRoute } = registerFs(fsPromises, { approvedDirectories: [] }, { list: async () => [] })
    const listRoute = getRoute("GET", "/api/fs/list")
    const missing = await callRoute(listRoute, { query: { path: "/repo/notes" } })
    expect(missing.statusCode).toBe(404)

    const created = await callRoute(getRoute("POST", "/api/fs/mkdir"), { body: { path: "/repo/notes" } })
    expect(created.statusCode).toBe(200)

    const listed = await callRoute(listRoute, { query: { path: "/repo/notes" } })
    expect(listed.statusCode).toBe(200)
  })

  it("refuses to delete the workspace root itself", async () => {
    // The containment check accepts the root (a relative path of "" is inside
    // it) and the removal is recursive, so this would take the whole project.
    const fsPromises = { rm: vi.fn(async () => undefined) }
    const { getRoute } = registerFs(fsPromises)

    const res = await callRoute(getRoute("POST", "/api/fs/delete"), { body: { path: "/repo" } })

    expect(res.statusCode).toBe(400)
    expect(res.body).toEqual({ error: "Cannot delete the workspace root" })
    expect(fsPromises.rm).not.toHaveBeenCalled()
  })
})

describe("fs raw download", () => {
  it("keeps a non-Latin-1 download name out of the header value", async () => {
    const content = Buffer.from("pdf")
    const coreFileAdapter = { raw: vi.fn(async () => ({ buffer: content, mimeType: "application/pdf" })) }
    const fsPromises = { stat: vi.fn(async () => ({ isDirectory: () => false })) }
    const { getRoute } = registerFs(fsPromises, { approvedDirectories: [] }, coreFileAdapter)

    const res = await callRoute(getRoute("GET", "/api/fs/raw"), {
      query: { path: "/repo/報告書.pdf", download: "true" },
    })

    // Node only accepts code points up to 0xFF in a header value, so interpolating
    // the raw name threw ERR_INVALID_CHAR and the 500 JSON body was saved as the
    // user's download. The quoted fallback must stay valid and filename* must carry
    // the real name.
    const disposition = res.getHeader("Content-Disposition")
    expect(() => validateHeaderValue("Content-Disposition", disposition)).not.toThrow()
    expect(disposition).toContain("filename*=UTF-8''%E5%A0%B1%E5%91%8A%E6%9B%B8.pdf")
    expect(res.statusCode).toBe(200)
    expect(res.sent).toEqual(content)
  })
})

describe("fs rename", () => {
  const missing = () => Object.assign(new Error("ENOENT"), { code: "ENOENT" })

  const registerRename = (existingPaths) => {
    const fsPromises = {
      realpath: vi.fn(async (targetPath) => {
        if (existingPaths.includes(targetPath)) return targetPath
        throw missing()
      }),
      rename: vi.fn(async () => undefined),
    }
    const { getRoute } = registerFs(fsPromises)
    return { handler: getRoute("POST", "/api/fs/rename"), fsPromises }
  }

  it("refuses to replace a destination that already exists", async () => {
    const { handler, fsPromises } = registerRename(["/repo", "/repo/a.txt", "/repo/b.txt"])

    const res = await callRoute(handler, { body: { oldPath: "/repo/a.txt", newPath: "/repo/b.txt" } })

    // `fs.rename` replaces the destination atomically, so this destroyed b.txt's
    // contents and still answered success.
    expect(res.statusCode).toBe(409)
    expect(res.body).toEqual({ error: "Destination path already exists" })
    expect(fsPromises.rename).not.toHaveBeenCalled()
  })

  it("renames to a destination that does not exist yet", async () => {
    const { handler, fsPromises } = registerRename(["/repo", "/repo/a.txt"])

    const res = await callRoute(handler, { body: { oldPath: "/repo/a.txt", newPath: "/repo/b.txt" } })

    expect(res.statusCode).toBe(200)
    expect(res.body).toEqual({ success: true, path: "/repo/b.txt" })
    expect(fsPromises.rename).toHaveBeenCalledWith("/repo/a.txt", "/repo/b.txt")
  })

  it("renames a symlinked entry itself, not what it points at", async () => {
    const fsPromises = {
      realpath: vi.fn(async (targetPath) => {
        if (targetPath === "/repo") return "/repo"
        if (targetPath === "/repo/pointing.txt") return "/repo/real/target.txt"
        if (targetPath === "/repo/moved.txt") throw missing()
        return targetPath
      }),
      rename: vi.fn(async () => undefined),
    }
    const { getRoute } = registerFs(fsPromises)

    const res = await callRoute(getRoute("POST", "/api/fs/rename"), {
      body: { oldPath: "/repo/pointing.txt", newPath: "/repo/moved.txt" },
    })

    expect(res.statusCode).toBe(200)
    // Renaming the target left the link pointing at a name that no longer exists.
    expect(fsPromises.rename).toHaveBeenCalledWith("/repo/pointing.txt", "/repo/moved.txt")
  })

  it("allows a case-only rename on a case-insensitive filesystem", async () => {
    // The destination resolves to the source entry, which is not a collision.
    const fsPromises = {
      realpath: vi.fn(async (targetPath) => {
        if (targetPath === "/repo/A.txt") return "/repo/a.txt"
        if (targetPath === "/repo/a.txt" || targetPath === "/repo") return targetPath
        throw missing()
      }),
      rename: vi.fn(async () => undefined),
    }
    const { getRoute } = registerFs(fsPromises)
    const res = await callRoute(getRoute("POST", "/api/fs/rename"), {
      body: { oldPath: "/repo/a.txt", newPath: "/repo/A.txt" },
    })

    expect(res.statusCode).toBe(200)
    expect(fsPromises.rename).toHaveBeenCalledWith("/repo/a.txt", "/repo/A.txt")
  })
})
