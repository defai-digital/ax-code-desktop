import React, { act } from "react"
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest"

import { RuntimeAPIContext } from "@/contexts/runtimeAPIContext"
import { I18nProvider } from "@/lib/i18n"
import type { GitBranchDiffResponse, GitBranchFileDiff, GitStatus, RuntimeAPIs } from "@/lib/api/types"
import { reviewContentSignature, useReviewProgressStore } from "@/stores/useReviewProgressStore"
import { useGitStore } from "@/stores/useGitStore"
import { useUIStore } from "@/stores/useUIStore"
import { useSessionUIStore } from "@/sync/session-ui-store"
import { cleanup, fireEvent, render, screen } from "@/test/dom"

import { BRANCH_REVIEW_BASE_STORAGE_KEY, useBranchReviewBaseStore } from "@/stores/useBranchReviewBaseStore"
import { getSafeStorage } from "@/stores/utils/safeStorage"
import { DiffView } from "./DiffView"

const DIRECTORY = "/repo"
const OTHER_DIRECTORY = "/other"

const harness = vi.hoisted(() => ({
  width: 1280,
  directory: "/repo",
  paneRef: { current: null as HTMLDivElement | null },
  files: [] as GitBranchFileDiff[],
  readFile: vi.fn(async () => ({ content: "const value = 2\n" })),
}))

vi.mock("@/hooks/useElementWidth", () => ({
  useElementWidth: () => ({ ref: harness.paneRef, width: harness.width }),
}))

vi.mock("@/hooks/useEffectiveDirectory", () => ({
  useEffectiveDirectory: () => harness.directory,
}))

vi.mock("@/sync/sync-context", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/sync/sync-context")>()),
  useSession: () => undefined,
}))

vi.mock("./PierreDiffViewer", () => ({
  PierreDiffViewer: (props: { original: string; modified: string; renderSideBySide: boolean; fileName?: string }) =>
    React.createElement("div", {
      "data-testid": "branch-diff",
      "data-original": props.original,
      "data-modified": props.modified,
      "data-side-by-side": String(props.renderSideBySide),
      "data-file": props.fileName ?? "",
    }),
}))

const gitApi = {
  checkIsGitRepository: vi.fn(async () => true),
  stageGitFiles: vi.fn(),
  createGitCommit: vi.fn(),
  gitFetch: vi.fn(async () => ({ success: true })),
  gitPush: vi.fn(),
  getGitStatus: vi.fn(
    async (): Promise<GitStatus> => ({
      headOid: "c".repeat(40),
      current: "feature",
      tracking: null,
      ahead: 0,
      behind: 0,
      files: [],
      isClean: true,
    }),
  ),
  getGitBranches: vi.fn(async () => ({
    all: ["feature", "main", "remotes/origin/main"],
    current: "feature",
    branches: {},
  })),
  getGitLog: vi.fn(async () => ({ commits: [] })),
  getCurrentGitIdentity: vi.fn(async () => null),
  getGitFileDiff: vi.fn(async () => ({ original: "", modified: "", path: "" })),
  getGitDiff: vi.fn(async () => ({ diff: "" })),
  getGitBranchDiff: vi.fn(
    async (_directory: string, options?: { base?: string }): Promise<GitBranchDiffResponse> => ({
      base: options?.base || "main",
      mergeBase: "a".repeat(40),
      truncated: false,
      files: harness.files,
    }),
  ),
}

const changedFile: GitBranchFileDiff = {
  file: "src/a.ts",
  before: "const value = 1\n",
  after: "const value = 2\n",
  additions: 1,
  deletions: 1,
  status: "modified",
}

function seedGit(directory = DIRECTORY, isGitRepo = true) {
  const now = Date.now()
  const directories = new Map(useGitStore.getState().directories)
  directories.set(directory, {
    isGitRepo,
    status: { current: "feature", tracking: null, ahead: 0, behind: 0, files: [], isClean: true },
    branches: null,
    log: null,
    identity: null,
    diffCache: new Map(),
    indexRevision: 0,
    lastRepoCheckAt: now,
    lastStatusFetch: now,
    lastStatusChange: 0,
    lastLogFetch: now,
    lastBranchesFetch: now,
    lastIdentityFetch: now,
    logMaxCount: 25,
    isLoadingStatus: false,
    isLoadingLog: false,
    isLoadingBranches: false,
    isLoadingIdentity: false,
  })
  useGitStore.setState({ activeDirectory: directory, directories })
}

function ReviewHarness({ showOpen = false }: { showOpen?: boolean }) {
  return (
    <I18nProvider>
      <RuntimeAPIContext.Provider
        value={{ git: gitApi, files: { readFile: harness.readFile } } as unknown as RuntimeAPIs}
      >
        <DiffView showOpenInEditorAction={showOpen} />
      </RuntimeAPIContext.Provider>
    </I18nProvider>
  )
}

function renderReview(showOpen = false) {
  return render(<ReviewHarness showOpen={showOpen} />)
}

async function flush() {
  for (let attempt = 0; attempt < 12; attempt += 1) {
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 0))
    })
  }
}

async function openBranch() {
  fireEvent.click(screen.getByRole("radio", { name: "Branch" }))
  await flush()
}

function buttonNames(): string[] {
  return screen.getAllByRole("button").map((button) => button.getAttribute("aria-label") || button.textContent || "")
}

describe("branch review scope", () => {
  const originalOpen = useUIStore.getState().openContextFileAtLine

  beforeEach(() => {
    gitApi.getGitStatus.mockReset()
    gitApi.getGitStatus.mockResolvedValue({
      headOid: "c".repeat(40),
      current: "feature",
      tracking: null,
      ahead: 0,
      behind: 0,
      files: [],
      isClean: true,
    })
    gitApi.stageGitFiles.mockReset()
    gitApi.createGitCommit.mockReset()
    gitApi.gitPush.mockReset()

    harness.width = 1280
    harness.directory = DIRECTORY
    harness.files = [changedFile]
    harness.readFile.mockClear()
    harness.readFile.mockResolvedValue({ content: "const value = 2\n" })
    gitApi.getGitBranchDiff.mockReset()
    gitApi.getGitBranchDiff.mockImplementation(async (_directory: string, options?: { base?: string }) => ({
      base: options?.base || "main",
      mergeBase: "a".repeat(40),
      truncated: false,
      files: harness.files,
    }))
    gitApi.getGitBranches.mockReset()
    gitApi.getGitBranches.mockResolvedValue({
      all: ["feature", "main", "remotes/origin/main"],
      current: "feature",
      branches: {},
    })
    gitApi.getGitFileDiff.mockClear()
    gitApi.getGitDiff.mockClear()
    gitApi.checkIsGitRepository.mockResolvedValue(true)
    useBranchReviewBaseStore.setState({ bases: {} })
    useSessionUIStore.setState({ currentSessionId: null })
    useReviewProgressStore.setState({ marks: {} })
    useUIStore.setState({
      diffLayoutPreference: "inline",
      diffFileLayout: {},
      diffWrapLines: false,
      openContextFileAtLine: originalOpen,
    })
    useGitStore.setState({ directories: new Map(), activeDirectory: null })
    seedGit()
  })

  afterEach(() => {
    cleanup()
    vi.restoreAllMocks()
  })

  test("a git repository shows Branch without a session, and a non-git directory hides the scope group", () => {
    renderReview()
    const radios = screen.getAllByRole("radio").map((radio) => radio.textContent)
    expect(radios).toEqual(["All", "Unstaged", "Staged", "Branch"])
    expect(screen.getByRole("radio", { name: "Branch" }).getAttribute("aria-checked")).toBe("false")
    expect(screen.queryByRole("radio", { name: "This session" })).toBeNull()

    cleanup()
    useGitStore.setState({ directories: new Map(), activeDirectory: null })
    seedGit(DIRECTORY, false)
    renderReview()
    expect(screen.queryByRole("radiogroup", { name: "Changes to show" })).toBeNull()
    expect(screen.queryByRole("radio", { name: "Branch" })).toBeNull()
  })

  test("Branch loads the working tree against the default base into a read-only rail", async () => {
    renderReview()
    await openBranch()

    expect(gitApi.getGitBranchDiff).toHaveBeenCalledWith(DIRECTORY, { base: undefined })
    expect(gitApi.getGitBranches).toHaveBeenCalledWith(DIRECTORY)
    expect(screen.getByText("1 file changed")).toBeTruthy()
    expect(screen.getByTestId("branch-diff").getAttribute("data-original")).toBe(changedFile.before)
    expect(screen.getByTestId("branch-diff").getAttribute("data-modified")).toBe(changedFile.after)
    expect(screen.getByTestId("branch-diff").getAttribute("data-side-by-side")).toBe("false")
    expect(buttonNames().some((name) => /stage|revert/i.test(name))).toBe(false)
    expect(screen.queryByRole("button", { name: "Single file" })).toBeNull()

    const select = screen.getByRole("combobox", { name: "Compare base" }) as HTMLSelectElement
    expect(Array.from(select.options).map((option) => option.value)).toEqual(["feature", "main"])
    expect(select.value).toBe("main")
  })

  test("the compare base is restored from storage per directory", async () => {
    renderReview()
    await openBranch()
    fireEvent.change(screen.getByRole("combobox", { name: "Compare base" }), { target: { value: "feature" } })
    await flush()
    expect(gitApi.getGitBranchDiff).toHaveBeenLastCalledWith(DIRECTORY, { base: "feature" })

    cleanup()
    const saved = getSafeStorage().getItem(BRANCH_REVIEW_BASE_STORAGE_KEY)!
    useBranchReviewBaseStore.setState({ bases: {} })
    getSafeStorage().setItem(BRANCH_REVIEW_BASE_STORAGE_KEY, saved)
    await useBranchReviewBaseStore.persist.rehydrate()
    gitApi.getGitBranchDiff.mockClear()
    const view = renderReview()
    await openBranch()
    expect((screen.getByRole("combobox", { name: "Compare base" }) as HTMLSelectElement).value).toBe("feature")
    expect(gitApi.getGitBranchDiff).toHaveBeenCalledWith(DIRECTORY, { base: "feature" })

    harness.directory = OTHER_DIRECTORY
    seedGit(OTHER_DIRECTORY)
    view.rerender(<ReviewHarness />)
    await flush()
    expect(gitApi.getGitBranchDiff).toHaveBeenCalledWith(OTHER_DIRECTORY, { base: undefined })
    expect((screen.getByRole("combobox", { name: "Compare base" }) as HTMLSelectElement).value).toBe("main")
  })

  test("a restored base missing from the branch list silently uses the default", async () => {
    getSafeStorage().setItem(
      BRANCH_REVIEW_BASE_STORAGE_KEY,
      JSON.stringify({
        version: 1,
        state: { bases: { [DIRECTORY]: "removed-branch" } },
      }),
    )
    await useBranchReviewBaseStore.persist.rehydrate()
    renderReview()
    await openBranch()
    expect(gitApi.getGitBranchDiff).toHaveBeenCalledExactlyOnceWith(DIRECTORY, { base: undefined })
    expect((screen.getByRole("combobox", { name: "Compare base" }) as HTMLSelectElement).value).toBe("main")
    expect(screen.queryByRole("alert")).toBeNull()
    expect(useBranchReviewBaseStore.getState().bases[DIRECTORY]).toBeUndefined()
  })

  test.each(["binary", "tooLarge"] as const)("viewed %s branch files show the fallback marker", async (flag) => {
    harness.files = [{ ...changedFile, [flag]: true }]
    renderReview()
    await openBranch()
    const label = "Viewed state is based on line counts and may miss edits"
    expect(screen.queryByRole("img", { name: label })).toBeNull()
    fireEvent.click(screen.getByRole("checkbox", { name: "Mark a.ts as viewed" }))
    expect(screen.getByRole("img", { name: label }).getAttribute("title")).toBe(label)
    fireEvent.click(screen.getByRole("checkbox", { name: "Mark a.ts as viewed" }))
    expect(screen.queryByRole("img", { name: label })).toBeNull()
  })

  test("empty, error, and loading states", async () => {
    let resolveDiff: ((value: GitBranchDiffResponse) => void) | undefined
    gitApi.getGitBranchDiff.mockImplementation(
      () =>
        new Promise<GitBranchDiffResponse>((resolve) => {
          resolveDiff = resolve
        }),
    )
    renderReview()
    fireEvent.click(screen.getByRole("radio", { name: "Branch" }))
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 0))
    })
    expect(screen.getByRole("status", { name: "Loading changes..." }).getAttribute("aria-busy")).toBe("true")

    resolveDiff?.({ base: "main", mergeBase: "a".repeat(40), truncated: false, files: [] })
    await flush()
    expect(screen.getByText("No changes compared with main")).toBeTruthy()

    cleanup()
    gitApi.getGitBranchDiff.mockReset()
    gitApi.getGitBranchDiff.mockRejectedValueOnce(new Error("diff unavailable"))
    gitApi.getGitBranchDiff.mockResolvedValue({
      base: "main",
      mergeBase: "a".repeat(40),
      truncated: true,
      files: [changedFile],
    })
    renderReview()
    await openBranch()
    expect(screen.getByRole("alert").textContent).toContain("Failed to load diff")
    expect(screen.getByRole("alert").textContent).toContain("diff unavailable")
    fireEvent.click(screen.getByRole("button", { name: "Retry" }))
    await flush()
    expect(screen.getByTestId("branch-diff").getAttribute("data-modified")).toBe(changedFile.after)
    expect(screen.getByText("Showing the first 1 files")).toBeTruthy()
    expect(screen.queryByRole("alert")).toBeNull()
  })

  test("[ ] and v move the branch diff, and viewed follows the content signature", async () => {
    harness.files = [
      changedFile,
      { file: "src/b.ts", before: "old\n", after: "new\n", additions: 1, deletions: 1, status: "added" },
      { file: "src/gone.ts", before: "gone\n", after: "", additions: 0, deletions: 1, status: "deleted" },
    ]
    useUIStore.setState({ diffLayoutPreference: "dynamic" })
    renderReview()
    await openBranch()

    const pane = document.querySelector("[data-review-changes]") as HTMLElement
    pane.focus()
    expect(screen.getByTestId("branch-diff").getAttribute("data-file")).toBe("src/a.ts")
    expect(screen.getByTestId("branch-diff").getAttribute("data-side-by-side")).toBe("true")
    expect(
      screen.getByRole("listitem", { current: true }).querySelector("[aria-label='Modified file']")?.textContent,
    ).toBe("M")

    fireEvent.keyDown(pane, { key: "]" })
    expect(screen.getByTestId("branch-diff").getAttribute("data-file")).toBe("src/b.ts")
    expect(screen.getByRole("listitem", { current: true }).querySelector("[aria-label='New file']")?.textContent).toBe(
      "A",
    )
    fireEvent.keyDown(pane, { key: "[" })
    expect(screen.getByTestId("branch-diff").getAttribute("data-file")).toBe("src/a.ts")

    fireEvent.keyDown(pane, { key: "v" })
    const signature = reviewContentSignature("", changedFile.after, changedFile.status, changedFile.file)
    expect((screen.getByRole("checkbox", { name: "Mark a.ts as viewed" }) as HTMLInputElement).checked).toBe(true)
    expect(useReviewProgressStore.getState().isViewed(DIRECTORY, "branch:main", changedFile.file, signature)).toBe(true)
    expect(screen.getByTestId("branch-diff").getAttribute("data-file")).toBe("src/b.ts")

    fireEvent.click(document.querySelector("[data-review-file='src/gone.ts'] .review-file-rail__select") as HTMLElement)
    expect(screen.getByTestId("branch-diff").getAttribute("data-side-by-side")).toBe("false")
    expect(document.querySelector("[title='Switch to unified view']")).toBeNull()
    expect(document.querySelector("[title='Switch to side-by-side view']")).toBeNull()

    const rewritten = { ...changedFile, after: "const value = 3\n" }
    harness.files = [rewritten, harness.files[1], harness.files[2]]
    fireEvent.change(screen.getByRole("combobox", { name: "Compare base" }), { target: { value: "feature" } })
    await flush()
    fireEvent.change(screen.getByRole("combobox", { name: "Compare base" }), { target: { value: "main" } })
    await flush()
    fireEvent.click(document.querySelector("[data-review-file='src/a.ts'] .review-file-rail__select") as HTMLElement)
    expect((screen.getByRole("checkbox", { name: "Mark a.ts as viewed" }) as HTMLInputElement).checked).toBe(false)
    expect(
      useReviewProgressStore
        .getState()
        .isViewed(
          DIRECTORY,
          "branch:main",
          rewritten.file,
          reviewContentSignature("", rewritten.after, rewritten.status, rewritten.file),
        ),
    ).toBe(false)
    expect(screen.getByTestId("branch-diff").getAttribute("data-modified")).toBe(rewritten.after)
  })

  test("opening a branch file uses the merge-base diff and the working-tree path", async () => {
    const openContextFileAtLine = vi.fn()
    useUIStore.setState({ openContextFileAtLine })
    renderReview(true)
    await openBranch()
    gitApi.getGitFileDiff.mockClear()

    fireEvent.click(screen.getByRole("button", { name: "Open a.ts in the editor" }))
    await flush()

    expect(openContextFileAtLine).toHaveBeenCalledWith(DIRECTORY, "/repo/src/a.ts", 1, 1)
    expect(gitApi.getGitFileDiff).not.toHaveBeenCalled()
    expect(harness.readFile).toHaveBeenCalledWith("/repo/src/a.ts", { allowOutsideWorkspace: true })
  })

  test("switching sessions leaves Branch selected", async () => {
    const view = renderReview()
    await openBranch()
    useSessionUIStore.setState({ currentSessionId: "ses_next" })
    view.rerender(<ReviewHarness />)
    expect(screen.getByRole("radio", { name: "Branch" }).getAttribute("aria-checked")).toBe("true")
    expect(screen.getByRole("radio", { name: "This session" })).toBeTruthy()
    expect(screen.getByRole("radio", { name: "All" }).getAttribute("aria-checked")).toBe("false")
  })
  const localFile = (path: string) => ({
    path,
    index: " ",
    working_dir: "M",
    headBlobId: "1".repeat(40),
    indexBlobId: "1".repeat(40),
    worktreeBlobId: "2".repeat(40),
  })
  function seedLanding() {
    const local = { ...changedFile, beforeBlobId: "1".repeat(40) }
    harness.files = [local, { ...local, file: "committed.ts" }, { ...local, file: "unreviewed.ts" }]
    let status: GitStatus = {
      headOid: "c".repeat(40),
      current: "feature",
      tracking: "origin/feature",
      ahead: 1,
      behind: 0,
      files: [localFile(local.file), localFile("unreviewed.ts"), localFile("outside-branch.ts")],
      isClean: false,
    }
    useGitStore.getState().restoreStatus(DIRECTORY, status)
    gitApi.getGitStatus.mockImplementation(async () => status)
    gitApi.stageGitFiles.mockImplementation(async (_dir: string, paths: string[]) => {
      status = {
        ...status,
        files: status.files.map((file) =>
          paths.includes(file.path) ? { ...file, index: "M", working_dir: " " } : file,
        ),
      }
    })
    return local
  }

  test("Branch landing stages only reviewed uncommitted members and labels committed-only files", async () => {
    seedLanding()
    const { container } = renderReview()
    await openBranch()
    expect(container.textContent).toContain("Already committed (1)")
    expect(screen.getByRole("button", { name: "Stage all 2" })).toBeTruthy()
    fireEvent.click(screen.getByRole("checkbox", { name: "Mark a.ts as viewed" }))
    fireEvent.click(screen.getByRole("button", { name: "Stage all reviewed" }))
    await flush()
    expect(gitApi.stageGitFiles).toHaveBeenCalledExactlyOnceWith(DIRECTORY, ["src/a.ts"])
    expect(screen.getByRole("button", { name: "Commit 1 staged files" })).toBeTruthy()
  })

  test("Branch landing requires a second click for unreviewed files and progresses through Commit and Push", async () => {
    const local = seedLanding()
    harness.files = [local, { ...local, file: "committed.ts" }]
    const staged: GitStatus = {
      headOid: "c".repeat(40),
      current: "feature",
      tracking: "origin/feature",
      ahead: 1,
      behind: 0,
      files: [{ ...localFile(local.file), index: "M", working_dir: " " }],
      isClean: false,
    }
    gitApi.stageGitFiles.mockImplementation(async () => {
      gitApi.getGitStatus.mockResolvedValue(staged)
    })
    gitApi.createGitCommit.mockImplementation(async () => {
      gitApi.getGitStatus.mockResolvedValue({ ...staged, files: [], ahead: 2 })
    })
    gitApi.gitPush.mockImplementation(async () => {
      gitApi.getGitStatus.mockResolvedValue({ ...staged, files: [], ahead: 0 })
    })
    const { container } = renderReview()
    await openBranch()
    fireEvent.click(screen.getByRole("button", { name: "Stage all 1" }))
    expect(gitApi.stageGitFiles).not.toHaveBeenCalled()
    fireEvent.click(screen.getByRole("button", { name: "Confirm: stage all 1 unreviewed files" }))
    await flush()
    expect(gitApi.stageGitFiles).toHaveBeenCalledExactlyOnceWith(DIRECTORY, [local.file])
    fireEvent.click(screen.getByRole("button", { name: "Commit 1 staged files" }))
    fireEvent.change(container.querySelector("textarea")!, { target: { value: "fix: branch review" } })
    fireEvent.click(screen.getByRole("button", { name: "Commit 1 staged files" }))
    await flush()
    expect(gitApi.createGitCommit).toHaveBeenCalledExactlyOnceWith(DIRECTORY, "fix: branch review", {
      files: [local.file],
      stageFiles: [],
    })
    fireEvent.click(screen.getByRole("button", { name: "Push 2 commits to origin/feature" }))
    await flush()
    expect(gitApi.gitPush).toHaveBeenCalledExactlyOnceWith(DIRECTORY, { remote: "origin", branch: "feature:feature" })
  })

  test.each(["content", "merge-base", "status blob", "HEAD", "conflict"])(
    "Branch refuses staging when %s changed after display",
    async (change) => {
      const local = seedLanding()
      renderReview()
      await openBranch()
      fireEvent.click(screen.getByRole("checkbox", { name: "Mark a.ts as viewed" }))
      if (change === "content" || change === "merge-base") {
        gitApi.getGitBranchDiff.mockResolvedValueOnce({
          base: "main",
          mergeBase: (change === "merge-base" ? "b" : "a").repeat(40),
          truncated: false,
          files: [{ ...local, after: change === "content" ? "new content" : local.after }],
        })
      } else {
        const current = await gitApi.getGitStatus()
        gitApi.getGitStatus.mockResolvedValueOnce({
          ...current,
          headOid: change === "HEAD" ? "d".repeat(40) : current.headOid,
          mergeInProgress: change === "conflict" ? { head: "abc1234", message: "merge" } : undefined,
          files: current.files.map((file) => ({
            ...file,
            worktreeBlobId: change === "status blob" ? "3".repeat(40) : file.worktreeBlobId,
          })),
        })
      }
      fireEvent.click(screen.getByRole("button", { name: "Stage all reviewed" }))
      await flush()
      expect(gitApi.stageGitFiles).not.toHaveBeenCalled()
    },
  )

  test("Branch fallback marks and marks from another scope never silently stage files", async () => {
    seedLanding()
    harness.files = harness.files.map((file) => ({ ...file, beforeBlobId: undefined }))
    renderReview()
    await openBranch()
    fireEvent.click(screen.getByRole("checkbox", { name: "Mark a.ts as viewed" }))
    fireEvent.click(screen.getByRole("button", { name: "Stage all 2" }))
    expect(gitApi.stageGitFiles).not.toHaveBeenCalled()
    expect(screen.getByRole("button", { name: "Confirm: stage all 2 unreviewed files" })).toBeTruthy()
  })
})
