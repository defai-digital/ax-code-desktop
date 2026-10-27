import type { WikiMaintenanceStatus } from "@defai-digital/ax-code-sdk/v2"
import { beforeEach, describe, expect, test, vi } from "vitest"

const wiki = vi.hoisted(() => ({
  maintenance: vi.fn(),
  refresh: vi.fn(),
  visualization: vi.fn(),
}))

vi.mock("@/lib/ax-code/client", () => ({
  axCodeClient: {
    getApiClient: () => ({ wiki }),
    getScopedApiClient: () => ({ wiki }),
  },
}))

import { classifyWikiViewerResult, loadWikiMaintenance, requestWikiRefresh } from "./api"

const status = (overrides: Partial<WikiMaintenanceStatus> = {}): WikiMaintenanceStatus => ({
  phase: "ready",
  reason: "complete",
  completed: 0,
  total: 0,
  revision: 4,
  ...overrides,
})

beforeEach(() => {
  vi.clearAllMocks()
})

describe("loadWikiMaintenance", () => {
  test("keeps a reported status", async () => {
    const reported = status({ phase: "running", reason: "building", completed: 1, total: 3 })
    wiki.maintenance.mockResolvedValue({ data: reported })
    await expect(loadWikiMaintenance("/project")).resolves.toEqual({ status: "reported", maintenance: reported })
  })

  test("keeps the reason a disabled project reported", async () => {
    const disabled = status({ phase: "disabled", reason: "non_git", revision: 0 })
    wiki.maintenance.mockResolvedValue({ data: disabled })
    await expect(loadWikiMaintenance("/project")).resolves.toEqual({
      status: "disabled",
      maintenance: disabled,
      reason: "non_git",
    })
  })

  test("keeps the runtime's unattached fallback as a neutral disabled outcome", async () => {
    const disabled = status({ phase: "disabled", reason: "disabled", revision: 0 })
    wiki.maintenance.mockResolvedValue({ data: disabled })
    await expect(loadWikiMaintenance("/project")).resolves.toEqual({
      status: "disabled",
      maintenance: disabled,
      reason: "disabled",
    })
  })

  test("maps an unrelated disabled reason to the generic disabled outcome", async () => {
    const disabled = status({ phase: "disabled", reason: "idle", revision: 0 })
    wiki.maintenance.mockResolvedValue({ data: disabled })
    await expect(loadWikiMaintenance("/project")).resolves.toMatchObject({ status: "disabled", reason: "disabled" })
  })

  test("reports a request error and an exception as failed", async () => {
    wiki.maintenance.mockResolvedValueOnce({ error: { code: "invalid" } })
    await expect(loadWikiMaintenance("/project")).resolves.toEqual({ status: "failed" })
    wiki.maintenance.mockRejectedValueOnce(new Error("offline"))
    await expect(loadWikiMaintenance("/project")).resolves.toEqual({ status: "failed" })
  })
})

describe("requestWikiRefresh", () => {
  test("reports a queued refresh as started", async () => {
    const queued = status({ phase: "queued", reason: "idle", revision: 7 })
    wiki.refresh.mockResolvedValue({ data: queued })
    await expect(requestWikiRefresh("/project")).resolves.toEqual({ status: "started", maintenance: queued })
  })

  test("rejects a refresh the runtime reports as disabled", async () => {
    const disabled = status({ phase: "disabled", reason: "permissions", revision: 0 })
    wiki.refresh.mockResolvedValue({ data: disabled })
    await expect(requestWikiRefresh("/project")).resolves.toEqual({
      status: "disabled",
      maintenance: disabled,
      reason: "permissions",
    })
  })

  test("reports a request error and an exception as failed", async () => {
    wiki.refresh.mockResolvedValueOnce({ error: { code: "invalid" } })
    await expect(requestWikiRefresh("/project")).resolves.toEqual({ status: "failed" })
    wiki.refresh.mockRejectedValueOnce(new Error("offline"))
    await expect(requestWikiRefresh("/project")).resolves.toEqual({ status: "failed" })
  })
})

describe("classifyWikiViewerResult", () => {
  test("accepts the opened result", () => {
    expect(classifyWikiViewerResult({ opened: true })).toEqual({ opened: true })
  })

  test("keeps the known failure classes", () => {
    for (const failure of ["runtime_unavailable", "wiki_missing", "export_incompatible", "failed"]) {
      expect(classifyWikiViewerResult({ opened: false, failure })).toEqual({ opened: false, failure })
    }
  })

  test("falls back to a generic failure for anything else at the boundary", () => {
    expect(classifyWikiViewerResult(null)).toEqual({ opened: false, failure: "failed" })
    expect(classifyWikiViewerResult({ opened: false })).toEqual({ opened: false, failure: "failed" })
    expect(classifyWikiViewerResult({ opened: false, failure: "/private/project" })).toEqual({
      opened: false,
      failure: "failed",
    })
  })
})
