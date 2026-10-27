import { describe, expect, it, vi } from "vitest"
import crypto from "crypto"
import path from "path"

import { registerProjectIconRoutes } from "./project-icon-routes.js"
import { createMockResponse, createRouteRegistry } from "../../test-helpers/route-harness.js"

describe("project icon routes", () => {
  it("uses fallback file extension MIME when metadata points to a missing icon", async () => {
    const { app, getRoute } = createRouteRegistry()
    const jpgBytes = Buffer.from("jpg-bytes")
    const enoent = Object.assign(new Error("missing"), { code: "ENOENT" })
    const fsPromises = {
      readFile: vi.fn(async (iconPath) => {
        if (iconPath.endsWith(".jpg")) {
          return jpgBytes
        }
        throw enoent
      }),
    }

    registerProjectIconRoutes(app, {
      fsPromises,
      path,
      crypto,
      openchamberDataDir: "/tmp/openchamber-test",
      sanitizeProjects: (projects) => projects,
      readSettingsFromDiskMigrated: async () => ({
        projects: [
          {
            id: "proj-1",
            path: "/repo",
            iconImage: { mime: "image/png", updatedAt: 1, source: "custom" },
          },
        ],
      }),
      persistSettings: async () => ({}),
      createFsSearchRuntime: () => ({ searchFilesystemFiles: async () => [] }),
      spawn: vi.fn(),
      resolveGitBinaryForSpawn: vi.fn(),
    })

    const res = createMockResponse()
    await getRoute("GET", "/api/projects/:projectId/icon")(
      {
        params: { projectId: "proj-1" },
        query: {},
      },
      res,
    )

    expect(res.statusCode).toBe(200)
    expect(res.getHeader("Content-Type")).toBe("image/jpeg")
    expect(res.body).toBe(jpgBytes)
  })

  it("gives an icon response its own sandboxed policy", async () => {
    // An SVG is a document when it is opened directly, and the app's own CSP allows inline
    // script: without a policy of its own an icon carrying a script would run on the app's
    // loopback origin, where a same-origin request reaches the API with the session cookie.
    const { app, getRoute } = createRouteRegistry()
    const svgBytes = Buffer.from("<svg></svg>")
    const enoent = Object.assign(new Error("missing"), { code: "ENOENT" })
    const fsPromises = {
      readFile: vi.fn(async (iconPath) => {
        if (iconPath.endsWith(".svg")) {
          return svgBytes
        }
        throw enoent
      }),
    }

    registerProjectIconRoutes(app, {
      fsPromises,
      path,
      crypto,
      openchamberDataDir: "/tmp/openchamber-test",
      sanitizeProjects: (projects) => projects,
      readSettingsFromDiskMigrated: async () => ({
        projects: [
          {
            id: "proj-1",
            path: "/repo",
            iconImage: { mime: "image/svg+xml", updatedAt: 1, source: "custom" },
          },
        ],
      }),
      persistSettings: async () => ({}),
      createFsSearchRuntime: () => ({ searchFilesystemFiles: async () => [] }),
      spawn: vi.fn(),
      resolveGitBinaryForSpawn: vi.fn(),
    })

    const res = createMockResponse()
    await getRoute("GET", "/api/projects/:projectId/icon")({ params: { projectId: "proj-1" }, query: {} }, res)

    expect(res.statusCode).toBe(200)
    expect(res.getHeader("Content-Security-Policy")).toBe("default-src 'none'; style-src 'unsafe-inline'; sandbox")
    expect(res.getHeader("X-Content-Type-Options")).toBe("nosniff")
  })

  it("trims project id route params before project lookup", async () => {
    const { app, getRoute } = createRouteRegistry()
    const svgBytes = Buffer.from("<svg></svg>")
    const enoent = Object.assign(new Error("missing"), { code: "ENOENT" })
    const fsPromises = {
      readFile: vi.fn(async (iconPath) => {
        if (iconPath.endsWith(".svg")) {
          return svgBytes
        }
        throw enoent
      }),
    }

    registerProjectIconRoutes(app, {
      fsPromises,
      path,
      crypto,
      openchamberDataDir: "/tmp/openchamber-test",
      sanitizeProjects: (projects) => projects,
      readSettingsFromDiskMigrated: async () => ({
        projects: [
          {
            id: "proj-1",
            path: "/repo",
            iconImage: { mime: "image/svg+xml", updatedAt: 1, source: "custom" },
          },
        ],
      }),
      persistSettings: async () => ({}),
      createFsSearchRuntime: () => ({ searchFilesystemFiles: async () => [] }),
      spawn: vi.fn(),
      resolveGitBinaryForSpawn: vi.fn(),
    })

    const res = createMockResponse()
    await getRoute("GET", "/api/projects/:projectId/icon")(
      {
        params: { projectId: " proj-1 " },
        query: {},
      },
      res,
    )

    expect(res.statusCode).toBe(200)
    expect(res.getHeader("Content-Type")).toBe("image/svg+xml; charset=utf-8")
    expect(res.body).toBe(svgBytes)
  })

  it("discovers project favicon from bounded candidate paths without deep scan", async () => {
    const { app, getRoute } = createRouteRegistry()
    const pngBytes = Buffer.from("png-bytes")
    const searchFilesystemFiles = vi.fn(async () => [])
    const enoent = Object.assign(new Error("missing"), { code: "ENOENT" })
    const fsPromises = {
      stat: vi.fn(async (candidatePath) => {
        if (candidatePath === path.join("/repo", "public", "favicon.png")) {
          return { isFile: () => true }
        }
        throw enoent
      }),
      readFile: vi.fn(async (candidatePath) => {
        if (candidatePath === path.join("/repo", "public", "favicon.png")) {
          return pngBytes
        }
        throw enoent
      }),
      mkdir: vi.fn(async () => undefined),
      writeFile: vi.fn(async () => undefined),
      unlink: vi.fn(async () => undefined),
    }
    const updatedProject = {
      id: "proj-1",
      path: "/repo",
      iconImage: { mime: "image/png", updatedAt: 123, source: "auto" },
    }

    registerProjectIconRoutes(app, {
      fsPromises,
      path,
      crypto,
      openchamberDataDir: "/tmp/openchamber-test",
      sanitizeProjects: (projects) => projects,
      readSettingsFromDiskMigrated: async () => ({
        projects: [{ id: "proj-1", path: " /repo " }],
      }),
      persistSettings: async () => ({ projects: [updatedProject] }),
      createFsSearchRuntime: () => ({ searchFilesystemFiles }),
      spawn: vi.fn(),
      resolveGitBinaryForSpawn: vi.fn(),
    })

    const res = createMockResponse()
    await getRoute("POST", "/api/projects/:projectId/icon/discover")(
      {
        params: { projectId: "proj-1" },
        body: {},
      },
      res,
    )

    expect(res.statusCode).toBe(200)
    expect(searchFilesystemFiles).not.toHaveBeenCalled()
    expect(fsPromises.writeFile).toHaveBeenCalledWith(expect.stringContaining("project-icons"), pngBytes)
    expect(res.body.discoveredPath).toBe(path.join("/repo", "public", "favicon.png"))
  })

  it("uses deep scan only when explicitly requested for favicon discovery", async () => {
    const { app, getRoute } = createRouteRegistry()
    const svgBytes = Buffer.from("<svg></svg>")
    const searchFilesystemFiles = vi.fn(async () => [
      {
        path: path.join("/repo", "nested", "favicon.svg"),
      },
    ])
    const enoent = Object.assign(new Error("missing"), { code: "ENOENT" })
    const fsPromises = {
      stat: vi.fn(async () => {
        throw enoent
      }),
      readFile: vi.fn(async (candidatePath) => {
        if (candidatePath === path.join("/repo", "nested", "favicon.svg")) {
          return svgBytes
        }
        throw enoent
      }),
      mkdir: vi.fn(async () => undefined),
      writeFile: vi.fn(async () => undefined),
      unlink: vi.fn(async () => undefined),
    }

    registerProjectIconRoutes(app, {
      fsPromises,
      path,
      crypto,
      openchamberDataDir: "/tmp/openchamber-test",
      sanitizeProjects: (projects) => projects,
      readSettingsFromDiskMigrated: async () => ({
        projects: [{ id: "proj-1", path: "/repo" }],
      }),
      persistSettings: async () => ({
        projects: [
          {
            id: "proj-1",
            path: "/repo",
            iconImage: { mime: "image/svg+xml", updatedAt: 123, source: "auto" },
          },
        ],
      }),
      createFsSearchRuntime: () => ({ searchFilesystemFiles }),
      spawn: vi.fn(),
      resolveGitBinaryForSpawn: vi.fn(),
    })

    const defaultRes = createMockResponse()
    await getRoute("POST", "/api/projects/:projectId/icon/discover")(
      {
        params: { projectId: "proj-1" },
        body: {},
      },
      defaultRes,
    )

    expect(defaultRes.statusCode).toBe(404)
    expect(searchFilesystemFiles).not.toHaveBeenCalled()

    const deepScanRes = createMockResponse()
    await getRoute("POST", "/api/projects/:projectId/icon/discover")(
      {
        params: { projectId: "proj-1" },
        body: { deepScan: true },
      },
      deepScanRes,
    )

    expect(deepScanRes.statusCode).toBe(200)
    expect(searchFilesystemFiles).toHaveBeenCalledTimes(1)
    expect(deepScanRes.body.discoveredPath).toBe(path.join("/repo", "nested", "favicon.svg"))
  })

  it("discovers a .jpeg favicon as image/jpeg", async () => {
    const { app, getRoute } = createRouteRegistry()
    const jpegBytes = Buffer.from("jpeg-bytes")
    const jpegPath = path.join("/repo", "favicon.jpeg")
    const enoent = Object.assign(new Error("missing"), { code: "ENOENT" })
    const fsPromises = {
      stat: vi.fn(async (candidatePath) => {
        if (candidatePath === jpegPath) return { isFile: () => true }
        throw enoent
      }),
      readFile: vi.fn(async (candidatePath) => {
        if (candidatePath === jpegPath) return jpegBytes
        throw enoent
      }),
      mkdir: vi.fn(async () => undefined),
      writeFile: vi.fn(async () => undefined),
      unlink: vi.fn(async () => undefined),
    }
    const persistSettings = vi.fn(async (changes) => changes)

    registerProjectIconRoutes(app, {
      fsPromises,
      path,
      crypto,
      openchamberDataDir: "/tmp/openchamber-test",
      sanitizeProjects: (projects) => projects,
      readSettingsFromDiskMigrated: async () => ({ projects: [{ id: "proj-1", path: "/repo" }] }),
      persistSettings,
      createFsSearchRuntime: () => ({ searchFilesystemFiles: async () => [] }),
      spawn: vi.fn(),
      resolveGitBinaryForSpawn: vi.fn(),
    })

    const res = createMockResponse()
    await getRoute("POST", "/api/projects/:projectId/icon/discover")({ params: { projectId: "proj-1" }, body: {} }, res)

    expect(res.statusCode).toBe(200)
    expect(res.body.discoveredPath).toBe(jpegPath)
    expect(fsPromises.writeFile).toHaveBeenCalledWith(expect.stringMatching(/\.jpg$/), jpegBytes)
  })
})
