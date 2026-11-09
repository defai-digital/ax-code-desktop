import fs from "fs"
import os from "os"
import path from "path"
import { describe, expect, it, vi } from "vitest"

import { registerSkillRoutes } from "./skill-routes.js"
import { createMockResponse, createRouteRegistry } from "../../test-helpers/route-harness.js"

const registerSkills = (overrides = {}) => {
  const { app, getRoute } = createRouteRegistry()
  registerSkillRoutes(app, {
    fs,
    path,
    os,
    resolveProjectDirectory: async () => ({ directory: null }),
    resolveOptionalProjectDirectory: async () => ({ directory: null }),
    readSettingsFromDisk: async () => ({ skillCatalogs: [] }),
    sanitizeSkillCatalogs: (catalogs) => catalogs,
    isUnsafeSkillRelativePath: () => false,
    refreshAxCodeAfterConfigChange: vi.fn(async () => {}),
    clientReloadDelayMs: 100,
    buildAxCodeUrl: () => "http://127.0.0.1:1/",
    getAxCodeAuthHeaders: () => ({}),
    // No runtime: discovery answers from disk only, nothing is contacted.
    getAxCodePort: () => null,
    getSkillSources: () => [],
    discoverSkills: () => [],
    mergeDiscoveredSkills: (fromRuntime, fromDisk) => [...fromRuntime, ...fromDisk],
    createSkill: vi.fn(),
    updateSkill: vi.fn(),
    deleteSkill: vi.fn(),
    readSkillSupportingFile: vi.fn(),
    writeSkillSupportingFile: vi.fn(),
    deleteSkillSupportingFile: vi.fn(),
    SKILL_SCOPE: { USER: "user", PROJECT: "project" },
    SKILL_DIR: "/home/user/.config/ax-code/skills",
    getCuratedSkillsSources: () => [],
    getCacheKey: () => "cache-key",
    getCachedScan: () => null,
    setCachedScan: vi.fn(),
    parseSkillRepoSource: () => ({ ok: true, host: "github.com", normalizedRepo: "acme/skills" }),
    scanSkillsRepository: vi.fn(async () => ({ ok: true, items: [] })),
    installSkillsFromRepository: vi.fn(async () => ({ ok: true, installed: [], skipped: [] })),
    scanClawdHubPage: vi.fn(async () => ({ ok: true, items: [] })),
    installSkillsFromClawdHub: vi.fn(async () => ({ ok: true, installed: [], skipped: [] })),
    isClawdHubSource: () => false,
    getProfiles: () => [{ id: "work", name: "Work" }],
    getProfile: () => null,
    ...overrides,
  })
  return getRoute
}

describe("skill install", () => {
  it("reports a completed install as a success when only the reload fails", async () => {
    // The skills are on disk once the installer returns. The reload throwing answered 500, so the client treated
    // the install as failed and its retry hit name conflicts for the skills it had just installed.
    const getRoute = registerSkills({
      installSkillsFromRepository: vi.fn(async () => ({ ok: true, installed: [{ skillName: "review" }], skipped: [] })),
      refreshAxCodeAfterConfigChange: vi.fn(async () => {
        throw new Error("runtime restart timed out")
      }),
    })
    const res = createMockResponse()

    await getRoute("POST", "/api/config/skills/install")(
      { body: { source: "acme/skills", scope: "user", selections: [{ skillDir: "review" }] }, query: {} },
      res,
    )

    expect(res.statusCode).toBe(200)
    expect(res.body).toMatchObject({ ok: true, installed: [{ skillName: "review" }], reloadFailed: true })
  })
})

describe("skill catalog source", () => {
  it("asks for credentials when a saved source's identity is refused", async () => {
    // The scan route answers this with 401 and the identities to choose from; the catalog route answered 500,
    // so the client never offered to fix the credentials.
    const getRoute = registerSkills({
      readSettingsFromDisk: async () => ({
        skillCatalogs: [{ id: "private", label: "Private", source: "acme/private-skills", gitIdentityId: "work" }],
      }),
      scanSkillsRepository: vi.fn(async () => ({
        ok: false,
        error: { kind: "authRequired", message: "Authentication required" },
      })),
    })
    const res = createMockResponse()

    await getRoute("GET", "/api/config/skills/catalog/source")({ query: { sourceId: "private" } }, res)

    expect(res.statusCode).toBe(401)
    expect(res.body.error).toMatchObject({ kind: "authRequired", identities: [{ id: "work", name: "Work" }] })
  })
})
