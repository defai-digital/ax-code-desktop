import React, { act } from "react"
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest"
import { I18nProvider } from "@/lib/i18n"
import type { GitStatus } from "@/lib/api/types"
import { useGitStore } from "@/stores/useGitStore"
import { cleanup, fireEvent, render, screen } from "@/test/dom"
import type { VerificationEvidenceTarget } from "@/lib/supervision/verificationEvidenceCache"
import { ReviewLanding } from "./ReviewLanding"

const mocks = vi.hoisted(() => ({
  risk: vi.fn(),
  session: { time: { updated: 1 } },
  git: {
    getGitStatus: vi.fn(),
    createGitCommit: vi.fn(),
    gitPush: vi.fn(),
    gitFetch: vi.fn(),
    checkIsGitRepository: vi.fn(async () => true),
    getGitBranches: vi.fn(async () => ({ all: [], current: "topic", branches: {} })),
    getGitLog: vi.fn(async () => ({ all: [], total: 0, latest: null })),
  },
}))
vi.mock("@/hooks/useRuntimeAPIs", () => ({ useRuntimeAPIs: () => ({ git: mocks.git }) }))
vi.mock("@/sync/sync-context", () => ({ useSession: () => mocks.session }))
vi.mock("@/lib/ax-code/client", () => ({
  axCodeClient: { getScopedSdkClient: () => ({ session: { risk: mocks.risk } }) },
}))
vi.mock("@/hooks/useSupervisionVerification", async (importOriginal) => {
  const original = await importOriginal<typeof import("@/hooks/useSupervisionVerification")>()
  const { createVerificationEvidenceCache } = await import("@/lib/supervision/verificationEvidenceCache")
  const cache = createVerificationEvidenceCache(
    ({ sessionID, directory, signal }) => mocks.risk({ sessionID, directory, envelopes: true }, { signal }),
    { minRefetchMs: 0 },
  )
  return {
    verificationEvidenceCache: cache,
    useSupervisionVerificationDemand: (rows: VerificationEvidenceTarget[]) =>
      original.useSupervisionVerificationDemand(rows, cache),
  }
})
vi.mock("@/components/ui", () => ({ toast: { error: vi.fn(), success: vi.fn() } }))

let sequence = 0
let sessionId: string
const directory = "/repo"
let status: GitStatus
const envelope = (state: string) => ({
  schemaVersion: 1,
  workflow: "qa",
  result: { passed: state === "passed", status: state, output: state === "passed" ? "all failed" : "all passed" },
})
const flush = () =>
  act(async () => {
    await new Promise((resolve) => setTimeout(resolve, 0))
  })
function Harness({ id = sessionId }: { id?: string | null }) {
  return (
    <I18nProvider>
      <ReviewLanding directory={directory} scope="staged" files={[]} sessionId={id} />
    </I18nProvider>
  )
}
beforeEach(() => {
  vi.clearAllMocks()
  sessionId = `landing-checks-${++sequence}`
  mocks.session = { time: { updated: 1 } }
  status = {
    headOid: "a".repeat(40),
    current: "topic",
    tracking: "origin/topic",
    ahead: 1,
    behind: 0,
    isClean: false,
    files: [{ path: "a.ts", index: "M", working_dir: " ", indexBlobId: "b".repeat(40) }],
  }
  useGitStore.setState({ directories: new Map(), activeDirectory: null })
  useGitStore.getState().setActiveDirectory(directory)
  useGitStore.getState().restoreStatus(directory, status)
  mocks.git.getGitStatus.mockImplementation(async () => status)
})
afterEach(cleanup)

describe("runtime checks beside landing", () => {
  test.each(["passed", "failed", "pending"])(
    "shows %s envelopes, ignores contradictory output text, and does not block Commit or Push",
    async (state) => {
      mocks.risk.mockResolvedValue({ data: { envelopes: [envelope(state === "pending" ? "skipped" : state)] } })
      const { container } = render(<Harness />)
      await flush()
      expect(container.querySelector("[data-checks-state]")?.getAttribute("data-checks-state")).toBe(state)
      expect(container.textContent?.includes("Runtime checks are failing or stale")).toBe(state === "failed")
      expect((screen.getByRole("button", { name: "Commit 1 staged files" }) as HTMLButtonElement).disabled).toBe(false)
      fireEvent.click(screen.getByRole("button", { name: "Commit 1 staged files" }))
      fireEvent.change(container.querySelector("textarea")!, { target: { value: "fix: continue explicitly" } })
      fireEvent.click(screen.getByRole("button", { name: "Commit 1 staged files" }))
      await flush()
      expect(mocks.git.createGitCommit).toHaveBeenCalledTimes(1)
      act(() => {
        status = { ...status, files: [] }
        useGitStore.getState().restoreStatus(directory, status)
      })
      expect(container.textContent?.includes("Runtime checks are failing or stale")).toBe(state === "failed")
      fireEvent.click(screen.getByRole("button", { name: "Push 1 commits to origin/topic" }))
      await flush()
      expect(mocks.git.gitPush).toHaveBeenCalledTimes(1)
      expect(mocks.risk).toHaveBeenCalledWith(
        { sessionID: sessionId, directory, envelopes: true },
        expect.objectContaining({ signal: expect.any(AbortSignal) }),
      )
    },
  )

  test("a failed refresh visibly marks older passing evidence stale and warns without blocking", async () => {
    mocks.risk
      .mockResolvedValueOnce({ data: { envelopes: [envelope("passed")] } })
      .mockResolvedValue({ error: "offline" })
    const { container, rerender } = render(<Harness />)
    await flush()
    mocks.session = { time: { updated: 2 } }
    rerender(<Harness />)
    await flush()
    expect(container.querySelector("[data-checks-stale]")).not.toBeNull()
    expect(container.textContent).toContain("Runtime checks are failing or stale")
    expect((screen.getByRole("button", { name: "Commit 1 staged files" }) as HTMLButtonElement).disabled).toBe(false)
    act(() => {
      status = { ...status, files: [] }
      useGitStore.getState().restoreStatus(directory, status)
    })
    fireEvent.click(screen.getByRole("button", { name: "Push 1 commits to origin/topic" }))
    await flush()
    expect(mocks.git.gitPush).toHaveBeenCalledTimes(1)
  })

  test("missing or prose-only evidence does not manufacture checks and a different session cannot inherit them", async () => {
    mocks.risk
      .mockResolvedValueOnce({ data: { envelopes: [envelope("failed")] } })
      .mockResolvedValue({ data: { summary: "all checks passed" } })
    const { container, rerender } = render(<Harness />)
    await flush()
    expect(container.querySelector("[data-landing-checks]")).not.toBeNull()
    rerender(<Harness id="no-runtime-evidence" />)
    expect(container.querySelector("[data-landing-checks]")).toBeNull()
    await flush()
    expect(container.querySelector("[data-landing-checks]")).toBeNull()
    rerender(<Harness id={null} />)
    expect(container.querySelector("[data-landing-checks]")).toBeNull()
  })
})
