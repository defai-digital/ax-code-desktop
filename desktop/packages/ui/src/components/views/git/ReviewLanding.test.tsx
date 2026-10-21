import React, { act } from "react"
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest"
import { I18nProvider } from "@/lib/i18n"
import type { GitStatus } from "@/lib/api/types"
import { useGitStore } from "@/stores/useGitStore"
import {
  reviewContentSignature,
  reviewFileSignature,
  useReviewProgressStore,
  type ReviewGitScope,
} from "@/stores/useReviewProgressStore"
import { cleanup, fireEvent, render, screen } from "@/test/dom"
import { createHash } from "node:crypto"
import { ReviewLanding, type ReviewLandingSessionDiff } from "./ReviewLanding"

const blobId = (seed: string) => createHash("sha1").update(seed).digest("hex")

const { git, error } = vi.hoisted(() => ({
  git: {
    stageGitFiles: vi.fn(),
    stageGitFile: vi.fn(),
    createGitCommit: vi.fn(),
    gitFetch: vi.fn(),
    gitPush: vi.fn(),
    getGitStatus: vi.fn(),
    checkIsGitRepository: vi.fn(async () => true),
    getGitBranches: vi.fn(async () => ({ all: [], current: "topic", branches: {} })),
    getGitLog: vi.fn(async () => ({ all: [], total: 0, latest: null })),
  },
  error: vi.fn(),
}))
vi.mock("@/hooks/useRuntimeAPIs", () => ({ useRuntimeAPIs: () => ({ git }) }))
vi.mock("@/components/ui", () => ({ toast: { error, success: vi.fn() } }))

const directory = "/projects/example"
const file = (path: string, index = " ", working_dir = "M") => ({
  path,
  index,
  working_dir,
  insertions: 2,
  deletions: 1,
  // Content identities, so marks are verified rather than line-count fallbacks.
  headBlobId: blobId(`head:${path}`),
  indexBlobId: blobId(`index:${path}`),
  worktreeBlobId: blobId(`worktree:${path}`),
})
let status: GitStatus
function setStatus(patch: Partial<GitStatus>) {
  status = { ...status, ...patch }
  useGitStore.getState().restoreStatus(directory, status)
}
function Harness({ initialScope = "all" }: { initialScope?: ReviewGitScope }) {
  const [scope, setScope] = React.useState(initialScope)
  const current = useGitStore((state) => state.directories.get(directory)?.status)
  const files = (current?.files ?? [])
    .filter((entry) => scope !== "staged" || (entry.index.trim() && entry.index !== "?"))
    .map((entry) => ({ ...entry, insertions: 2, deletions: 1 }))
  return (
    <I18nProvider>
      <ReviewLanding directory={directory} scope={scope} files={files} onStaged={() => setScope("staged")} />
    </I18nProvider>
  )
}
const button = (name: string) => screen.getByRole("button", { name }) as HTMLButtonElement
const flush = () =>
  act(async () => {
    await new Promise((resolve) => setTimeout(resolve, 0))
  })
function deferred() {
  let resolve!: () => void
  let reject!: (error: Error) => void
  const promise = new Promise<void>((res, rej) => {
    resolve = res
    reject = rej
  })
  return { promise, resolve, reject }
}

beforeEach(() => {
  vi.clearAllMocks()
  useGitStore.setState({ directories: new Map(), activeDirectory: null })
  useGitStore.getState().setActiveDirectory(directory)
  status = {
    headOid: blobId("HEAD"),
    current: "topic",
    tracking: "origin/release/topic",
    ahead: 0,
    behind: 0,
    files: [],
    isClean: false,
  }
  setStatus({})
  useReviewProgressStore.setState({ marks: {} })
  git.getGitStatus.mockImplementation(async () => status)
  git.stageGitFiles.mockImplementation(async (_directory: string, paths: string[]) => {
    status = {
      ...status,
      files: status.files.map((entry) =>
        paths.includes(entry.path) ? { ...entry, index: "M", working_dir: " " } : entry,
      ),
    }
  })
  git.createGitCommit.mockImplementation(async () => {
    status = { ...status, files: status.files.filter((entry) => !entry.index.trim()), ahead: 1 }
  })
  git.gitFetch.mockResolvedValue({ success: true })
  git.gitPush.mockImplementation(async () => {
    status = { ...status, ahead: 0 }
  })
})
afterEach(cleanup)

describe("review to landing", () => {
  test.each(["stage", "commit"])("%s preflight bypasses cached status and rejects an external HEAD change", async (action) => {
    setStatus({ files: [file("a.ts", action === "commit" ? "M" : " ", action === "commit" ? " " : "M")] })
    const shown = status
    const { container } = render(<Harness />)
    fireEvent.click(button(action === "commit" ? "Commit 1 staged files" : "Stage all 1"))
    if (action === "commit") {
      fireEvent.change(container.querySelector("textarea")!, { target: { value: "fix: draft" } })
    }
    git.getGitStatus.mockImplementation(async (_directory, options) =>
      options?.bypassCache ? { ...shown, headOid: blobId("external HEAD") } : shown,
    )
    fireEvent.click(button(action === "commit" ? "Commit 1 staged files" : "Confirm: stage all 1 unreviewed files"))
    await flush()
    expect(git.getGitStatus).toHaveBeenCalledWith(directory, { bypassCache: true })
    expect(git.stageGitFiles).not.toHaveBeenCalled()
    expect(git.createGitCommit).not.toHaveBeenCalled()
    expect(error).toHaveBeenCalledWith(action === "commit"
      ? "The staged files changed. Check the updated list before committing."
      : "Files changed since they were reviewed. Review the updated changes before staging.")
  })

  test.each(["stage", "push", "idle"])("closes the composer on %s and restores its draft when commit returns", async (next) => {
    setStatus({ files: [file("a.ts", "M", " ")] })
    const { container } = render(<Harness />)
    fireEvent.click(button("Commit 1 staged files"))
    fireEvent.change(container.querySelector("textarea")!, { target: { value: "fix: retained draft" } })
    act(() => setStatus({ files: next === "stage" ? [file("a.ts")] : [], ahead: next === "push" ? 1 : 0 }))
    expect(container.querySelector("textarea")).toBeNull()
    expect(git.createGitCommit).not.toHaveBeenCalled()
    act(() => setStatus({ files: [{ ...file("a.ts", "M", " "), indexBlobId: blobId("new index") }], ahead: 0 }))
    fireEvent.click(button("Commit 1 staged files"))
    const input = container.querySelector("textarea")!
    expect(input.value).toBe("fix: retained draft")
    expect(document.activeElement).toBe(input)
    fireEvent.keyDown(input, { key: "Enter", metaKey: true })
    await flush()
    expect(git.createGitCommit).toHaveBeenCalledWith(directory, "fix: retained draft", {
      files: ["a.ts"], stageFiles: [],
    })
  })

  test("progresses stage → commit input → push → up to date with branch, counts and selected files", async () => {
    setStatus({ files: [file("a.ts"), file("b.ts")] })
    const { container } = render(<Harness />)
    expect(container.textContent).toContain("example · topic · 2 files")
    expect(container.querySelectorAll("li")).toHaveLength(2)
    fireEvent.click(button("Stage all 2"))
    // Staging files nobody reviewed takes a second, explicit click.
    expect(git.stageGitFiles).not.toHaveBeenCalled()
    fireEvent.click(button("Confirm: stage all 2 unreviewed files"))
    await flush()
    fireEvent.click(button("Commit 2 staged files"))
    const input = container.querySelector("textarea")!
    expect(document.activeElement).toBe(input)
    expect(button("Commit 2 staged files").disabled).toBe(true)
    expect(container.textContent).toContain("Enter a commit message")
    fireEvent.change(input, { target: { value: " fix: reviewed changes " } })
    fireEvent.keyDown(input, { key: "Enter", metaKey: true })
    await flush()
    expect(git.createGitCommit).toHaveBeenCalledWith(directory, "fix: reviewed changes", {
      files: ["a.ts", "b.ts"],
      stageFiles: [],
    })
    fireEvent.click(button("Push 1 commits to origin/release/topic"))
    await flush()
    expect(git.gitPush).toHaveBeenCalledWith(directory, { remote: "origin", branch: "topic:release/topic" })
    expect(git.gitFetch.mock.invocationCallOrder[0]).toBeLessThan(git.gitPush.mock.invocationCallOrder[0])
    expect(button("Up to date").disabled).toBe(true)
  })

  test("stages only matching viewed files in the current scope and repository", async () => {
    const files = [
      file("reviewed.ts"),
      file("unviewed.ts"),
      file("old.ts"),
      file("other-scope.ts"),
      file("other-repo.ts"),
      file("staged.ts", "M", " "),
    ]
    setStatus({ files })
    const mark = useReviewProgressStore.getState().setViewed
    mark(directory, "all", files[0].path, reviewFileSignature(files[0], "all"), true)
    mark(directory, "all", files[2].path, "outdated-signature", true)
    mark(directory, "working", files[3].path, reviewFileSignature(files[3], "working"), true)
    mark("/other", "all", files[4].path, reviewFileSignature(files[4], "all"), true)
    mark(directory, "all", files[5].path, reviewFileSignature(files[5], "all"), true)
    const { container } = render(<Harness />)
    expect(container.textContent).toContain("example · topic · 1 files")
    expect(Array.from(container.querySelectorAll("li"), (li) => li.textContent)).toEqual(["reviewed.ts"])
    fireEvent.click(button("Stage all reviewed"))
    await flush()
    expect(git.stageGitFiles).toHaveBeenCalledWith(directory, ["reviewed.ts"])
    expect(button("Commit 2 staged files")).toBeTruthy()
  })

  test("working scope uses its own marks, while staged scope never stages unstaged changes", async () => {
    const entry = file("a.ts", "M", "M")
    setStatus({ files: [entry, file("b.ts")] })
    useReviewProgressStore
      .getState()
      .setViewed(directory, "working", entry.path, reviewFileSignature(entry, "working"), true)
    const { rerender } = render(<Harness initialScope="working" />)
    fireEvent.click(button("Stage all reviewed"))
    await flush()
    expect(git.stageGitFiles).toHaveBeenCalledWith(directory, ["a.ts"])
    rerender(<Harness initialScope="staged" key="staged" />)
    expect(button("Commit 1 staged files")).toBeTruthy()
  })

  test("blocks two stage clicks in the same tick and shows progress", async () => {
    setStatus({ files: [file("a.ts")] })
    const wait = deferred()
    git.stageGitFiles.mockReturnValueOnce(wait.promise)
    const { container } = render(<Harness />)
    fireEvent.click(button("Stage all 1"))
    const stage = button("Confirm: stage all 1 unreviewed files")
    act(() => {
      stage.click()
      stage.click()
    })
    // Staging first re-reads the repository, so the request starts after that read.
    await act(async () => {
      await Promise.resolve()
      await Promise.resolve()
    })
    expect(git.stageGitFiles).toHaveBeenCalledTimes(1)
    expect(button("Staging files…").disabled).toBe(true)
    expect(container.querySelector("section")?.getAttribute("aria-busy")).toBe("true")
    await act(async () => wait.resolve())
    await flush()
  })

  test("failed commit preserves the message, reports the error and allows retry; Ctrl+Enter cannot double submit", async () => {
    setStatus({ files: [file("a.ts", "M", " ")] })
    const wait = deferred()
    git.createGitCommit.mockReturnValueOnce(wait.promise)
    const { container } = render(<Harness initialScope="staged" />)
    fireEvent.click(button("Commit 1 staged files"))
    const input = container.querySelector("textarea")!
    fireEvent.change(input, { target: { value: "fix: keep my draft" } })
    act(() => {
      input.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", ctrlKey: true, bubbles: true }))
      input.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", metaKey: true, bubbles: true }))
    })
    await act(async () => {
      await Promise.resolve()
      await Promise.resolve()
    })
    expect(git.createGitCommit).toHaveBeenCalledTimes(1)
    expect(button("Committing…").disabled).toBe(true)
    await act(async () => wait.reject(new Error("Commit hook rejected")))
    await flush()
    expect(error).toHaveBeenCalledWith("Commit hook rejected")
    expect(input.value).toBe("fix: keep my draft")
    expect(button("Commit 1 staged files").disabled).toBe(false)
    fireEvent.click(button("Commit 1 staged files"))
    await flush()
    expect(git.createGitCommit).toHaveBeenCalledTimes(2)
  })

  test("push guard prevents duplicate requests and rejects newly discovered incoming commits", async () => {
    setStatus({ ahead: 2 })
    const wait = deferred()
    git.gitFetch.mockReturnValueOnce(wait.promise)
    render(<Harness />)
    const push = button("Push 2 commits to origin/release/topic")
    act(() => {
      push.click()
      push.click()
    })
    expect(git.gitFetch).toHaveBeenCalledTimes(1)
    expect(button("Pushing commits…").disabled).toBe(true)
    status = { ...status, behind: 1 }
    await act(async () => wait.resolve())
    await flush()
    expect(git.gitPush).not.toHaveBeenCalled()
    expect(error).toHaveBeenCalled()
    expect(button("Push 2 commits to origin/release/topic").disabled).toBe(true)
  })

  test("staging failure reports the error, retains review marks and permits retry", async () => {
    const entry = file("reviewed.ts")
    setStatus({ files: [entry] })
    useReviewProgressStore.getState().setViewed(directory, "all", entry.path, reviewFileSignature(entry, "all"), true)
    git.stageGitFiles.mockRejectedValueOnce(new Error("Index locked"))
    render(<Harness />)
    fireEvent.click(button("Stage all reviewed"))
    await flush()
    expect(error.mock.calls).toEqual([["Index locked"]])
    expect(button("Stage all reviewed").disabled).toBe(false)
    expect(
      useReviewProgressStore.getState().isViewed(directory, "all", entry.path, reviewFileSignature(entry, "all")),
    ).toBe(true)
    fireEvent.click(button("Stage all reviewed"))
    await flush()
    expect(git.stageGitFiles).toHaveBeenCalledTimes(2)
    expect(button("Commit 1 staged files")).toBeTruthy()
  })

  test("a completed stage does not change another review pane after unmount", async () => {
    setStatus({ files: [file("a.ts")] })
    const wait = deferred()
    const onStaged = vi.fn()
    git.stageGitFiles.mockReturnValueOnce(wait.promise)
    render(
      <I18nProvider>
        <ReviewLanding directory={directory} scope="all" files={[file("a.ts")]} onStaged={onStaged} />
      </I18nProvider>,
    )
    fireEvent.click(button("Stage all 1"))
    cleanup()
    await act(async () => wait.resolve())
    await flush()
    expect(onStaged).not.toHaveBeenCalled()
  })

  test("missing upstream, detached HEAD, conflicts and incoming commits have visible disabled reasons", () => {
    setStatus({ ahead: 1, tracking: null })
    const { container } = render(<Harness />)
    expect(container.textContent).toContain("Configure an upstream in Git before pushing.")
    expect(container.querySelector("button")?.disabled).toBe(true)
    act(() => setStatus({ current: "HEAD" }))
    expect(container.textContent).toContain("Check out a branch to continue.")
    act(() => setStatus({ current: "topic", files: [file("conflict", "U", "U")] }))
    expect(container.textContent).toContain("Resolve conflicts")
    act(() => setStatus({ files: [], ahead: 0, behind: 3 }))
    expect(container.textContent).toContain("Pull 3 incoming commits")
  })

  test("a file rewritten after review is not staged, and a line-count mark never counts as reviewed", async () => {
    const entry = file("reviewed.ts")
    const countsOnly = { ...file("counts-only.ts"), worktreeBlobId: undefined }
    setStatus({ files: [entry, countsOnly] })
    const mark = useReviewProgressStore.getState().setViewed
    mark(directory, "all", entry.path, reviewFileSignature(entry, "all"), true)
    mark(directory, "all", countsOnly.path, reviewFileSignature(countsOnly, "all"), true)
    const { container } = render(<Harness />)
    expect(container.textContent).toContain("example · topic · 1 files")
    // An agent rewrites the reviewed file before the click; the cached status still shows the reviewed content.
    git.getGitStatus.mockImplementationOnce(async () => ({
      ...status,
      files: [{ ...entry, worktreeBlobId: blobId("rewritten") }, countsOnly],
    }))
    fireEvent.click(button("Stage all reviewed"))
    await flush()
    expect(git.stageGitFiles).not.toHaveBeenCalled()
    expect(error).toHaveBeenCalledWith(
      "Files changed since they were reviewed. Review the updated changes before staging.",
    )
  })

  test("a commit is refused when the index no longer matches the staged list on screen", async () => {
    setStatus({ files: [file("a.ts", "M", " ")] })
    const { container } = render(<Harness initialScope="staged" />)
    fireEvent.click(button("Commit 1 staged files"))
    fireEvent.change(container.querySelector("textarea")!, { target: { value: "fix: only a" } })
    git.getGitStatus.mockImplementationOnce(async () => ({
      ...status,
      files: [...status.files, file("sneaked-in.ts", "A", " ")],
    }))
    fireEvent.click(button("Commit 1 staged files"))
    await flush()
    expect(git.createGitCommit).not.toHaveBeenCalled()
    expect(error).toHaveBeenCalledWith("The staged files changed. Check the updated list before committing.")
    expect(container.querySelector("textarea")!.value).toBe("fix: only a")
  })
  test.each(["index blob", "HEAD", "missing index", "missing HEAD", "new conflict"])(
    "commit refuses changed %s identity",
    async (change) => {
      setStatus({ files: [file("a.ts", "M", " ")] })
      const { container } = render(<Harness initialScope="staged" />)
      fireEvent.click(button("Commit 1 staged files"))
      fireEvent.change(container.querySelector("textarea")!, { target: { value: "fix: reviewed" } })
      git.getGitStatus.mockResolvedValueOnce({
        ...status,
        headOid: change === "HEAD" ? blobId("new HEAD") : change === "missing HEAD" ? undefined : status.headOid,
        mergeInProgress: change === "new conflict" ? { head: "abc1234", message: "Merge" } : undefined,
        files: status.files.map((entry) => ({
          ...entry,
          indexBlobId:
            change === "index blob" ? blobId("restaged") : change === "missing index" ? undefined : entry.indexBlobId,
        })),
      })
      fireEvent.click(button("Commit 1 staged files"))
      await flush()
      expect(git.createGitCommit).not.toHaveBeenCalled()
      expect(error).toHaveBeenCalledWith("The staged files changed. Check the updated list before committing.")
      expect(container.querySelector("textarea")!.value).toBe("fix: reviewed")
    },
  )

  test("commit keeps the identity shown when composition began across a status refresh", async () => {
    setStatus({ files: [file("a.ts", "M", " ")] })
    const { container } = render(<Harness initialScope="staged" />)
    fireEvent.click(button("Commit 1 staged files"))
    fireEvent.change(container.querySelector("textarea")!, { target: { value: "fix: reviewed" } })
    act(() => setStatus({ files: [{ ...file("a.ts", "M", " "), indexBlobId: blobId("restaged") }] }))
    fireEvent.click(button("Commit 1 staged files"))
    await flush()
    expect(git.createGitCommit).not.toHaveBeenCalled()
  })

  test.each(["deletion", "unborn"])("commit allows a known %s absence", async (kind) => {
    setStatus({
      headOid: kind === "unborn" ? null : blobId("HEAD"),
      files: [
        {
          ...file("a.ts", kind === "deletion" ? "D" : "A", " "),
          indexBlobId: kind === "deletion" ? null : blobId("added"),
        },
      ],
    })
    const { container } = render(<Harness initialScope="staged" />)
    fireEvent.click(button("Commit 1 staged files"))
    fireEvent.change(container.querySelector("textarea")!, { target: { value: "fix: reviewed" } })
    fireEvent.click(button("Commit 1 staged files"))
    await flush()
    expect(git.createGitCommit).toHaveBeenCalledTimes(1)
  })
  test.each(["index", "HEAD"])("commit refuses consistently unavailable %s identity", async (missing) => {
    setStatus({
      headOid: missing === "HEAD" ? undefined : blobId("HEAD"),
      files: [{ ...file("a.ts", "M", " "), indexBlobId: missing === "index" ? undefined : blobId("index") }],
    })
    const { container } = render(<Harness initialScope="staged" />)
    fireEvent.click(button("Commit 1 staged files"))
    fireEvent.change(container.querySelector("textarea")!, { target: { value: "fix: unknown content" } })
    fireEvent.click(button("Commit 1 staged files"))
    await flush()
    expect(git.createGitCommit).not.toHaveBeenCalled()
    expect(error).toHaveBeenCalled()
  })

  test("unreviewed confirmation is invalidated by a same-path content change", async () => {
    setStatus({ files: [file("a.ts")] })
    render(<Harness />)
    fireEvent.click(button("Stage all 1"))
    act(() => setStatus({ files: [{ ...file("a.ts"), worktreeBlobId: blobId("rewrite") }] }))
    fireEvent.click(button("Stage all 1"))
    await flush()
    expect(git.stageGitFiles).not.toHaveBeenCalled()
    expect(button("Confirm: stage all 1 unreviewed files")).toBeTruthy()
  })
})

describe("landing from a session or turn scope", () => {
  const rawBlobId = (text: string) =>
    createHash("sha1").update(`blob ${Buffer.byteLength(text)}\0`).update(text).digest("hex")
  const sessionFile = (path: string, after: string, status = "modified", before = "before\n") => ({
    path,
    before: status === "added" ? "" : before,
    after,
    status,
    signature: reviewContentSignature(status === "added" ? "" : before, after, status, path),
  })
  // The live state that staging would turn into exactly the reviewed change.
  const live = (path: string, after: string | null, patch: Record<string, unknown> = {}) => ({
    ...file(path, " ", after === null ? "D" : "M"),
    indexBlobId: rawBlobId("before\n"),
    indexMode: "100644",
    worktreeBlobId: after === null ? null : rawBlobId(after),
    worktreeMode: after === null ? null : "100644",
    ...patch,
  })
  function SessionHarness({ diff, scope = "session" }: { diff: ReviewLandingSessionDiff; scope?: "session" | `turn:${string}` }) {
    const current = useGitStore((state) => state.directories.get(directory)?.status)
    const files = diff.files.map((entry) => ({ path: entry.path, index: " ", working_dir: " ", insertions: 1, deletions: 1 }))
    return (
      <I18nProvider>
        {current ? <ReviewLanding directory={directory} scope={scope} files={files} sessionDiff={diff} /> : null}
      </I18nProvider>
    )
  }
  const markAll = (scope: string, diff: ReviewLandingSessionDiff) => {
    for (const entry of diff.files) useReviewProgressStore.getState().setViewed(directory, scope, entry.path, entry.signature, true)
  }

  test("stages only marked files whose staging applies exactly the reviewed change", async () => {
    const diff = {
      files: [
        sessionFile("kept.ts", "agent text\n"),
        sessionFile("edited.ts", "agent text\n"),
        sessionFile("unmarked.ts", "agent text\n"),
        sessionFile("removed.ts", "", "deleted"),
        sessionFile("created.ts", "new\n", "added"),
        sessionFile("created-executable.sh", "new\n", "added"),
        sessionFile("earlier-turn.ts", "agent text\n"),
        sessionFile("swapped.ts", "agent text\n"),
        sessionFile("executable.ts", "agent text\n"),
      ],
    }
    setStatus({
      files: [
        live("kept.ts", "agent text\n"),
        // Edited by a person after the review: the worktree no longer holds what was signed.
        live("edited.ts", "agent text\nhuman edit\n"),
        live("unmarked.ts", "agent text\n"),
        live("removed.ts", null),
        { ...live("created.ts", "new\n"), index: "?", working_dir: "?", indexBlobId: null, indexMode: null },
        // A new executable shows the same text, but its mode was never shown.
        {
          ...live("created-executable.sh", "new\n"),
          index: "?",
          working_dir: "?",
          indexBlobId: null,
          indexMode: null,
          worktreeMode: "100755",
        },
        // An earlier turn already changed the file: the index does not hold this turn's `before`.
        live("earlier-turn.ts", "agent text\n", { indexBlobId: rawBlobId("original\n") }),
        // Same bytes, but a symlink or a new executable bit would be staged unseen.
        live("swapped.ts", "agent text\n", { worktreeMode: "120000", working_dir: "T" }),
        live("executable.ts", "agent text\n", { worktreeMode: "100755" }),
        // Not part of the session diff: never a candidate.
        live("unrelated.ts", "agent text\n"),
      ],
    })
    markAll("turn:m1", { files: diff.files.filter((entry) => entry.path !== "unmarked.ts") })
    const { container } = render(<SessionHarness diff={diff} scope="turn:m1" />)
    await flush()
    expect(Array.from(container.querySelectorAll("li"), (li) => li.textContent)).toEqual([
      "kept.ts",
      "removed.ts",
      "created.ts",
    ])
    fireEvent.click(button("Stage all reviewed"))
    await flush()
    expect(git.stageGitFiles).toHaveBeenCalledWith(directory, ["kept.ts", "removed.ts", "created.ts"])
  })

  test("a file rewritten between the review and the click is refused", async () => {
    const diff = { files: [sessionFile("kept.ts", "agent text\n")] }
    setStatus({ files: [live("kept.ts", "agent text\n")] })
    markAll("session", diff)
    render(<SessionHarness diff={diff} />)
    await flush()
    git.getGitStatus.mockImplementation(async () => ({ ...status, files: [live("kept.ts", "rewritten\n")] }))
    fireEvent.click(button("Stage all reviewed"))
    await flush()
    expect(git.stageGitFiles).not.toHaveBeenCalled()
    expect(error).toHaveBeenCalledWith(
      "Files changed since they were reviewed. Review the updated changes before staging.",
    )
  })
})
