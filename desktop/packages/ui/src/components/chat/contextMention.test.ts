import { describe, expect, test, vi } from "vitest"

import {
  buildContextAttachmentFile,
  commitEntriesFromLog,
  commitListFilter,
  composeContextBody,
  contextMentionKindsForQuery,
  filterCommitEntries,
  formatCommitLabel,
  clipCommitSubject,
  formatTerminalOutputLabel,
  plainTerminalText,
  removeMentionQueryAtCursor,
  resolveCommitContext,
  resolveTerminalContext,
  resolveUncommittedContext,
  stripAnsi,
  terminalMentionTargets,
  truncateContextText,
  CONTEXT_MENTION_MAX_BYTES,
  CONTEXT_MENTION_MAX_LINES,
  UNCOMMITTED_CHANGES_LABEL,
  type ContextMentionGitClient,
} from "./contextMention"

// jsdom's File does not implement Blob.text().
const readBlobText = async (blob: Blob): Promise<string> =>
  new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(String(reader.result ?? ""))
    reader.onerror = () => reject(reader.error)
    reader.readAsText(blob)
  })

describe("context mention formatting", () => {
  test("clips a commit subject without splitting a surrogate pair", () => {
    // 68 ASCII chars put the cut exactly inside an emoji; slicing code units left a lone
    // high surrogate in the label and attachment filename.
    const subject = `${"a".repeat(68)}🙂 tail`
    const clipped = clipCommitSubject(subject, 72)

    expect(clipped.endsWith("...")).toBe(true)
    expect(clipped).not.toMatch(/[\uD800-\uDBFF](?![\uDC00-\uDFFF])/)
    expect(Array.from(clipped.slice(0, -3)).every((character) => character.length > 0)).toBe(true)
  })

  test("strips ANSI color and normalizes carriage returns", () => {
    expect(stripAnsi("\u001B[31mred\u001B[0m")).toBe("red")
    expect(plainTerminalText("\u001B[32mok\u001B[0m\r\nnext\rline")).toBe("ok\nnext\nline")
  })

  test("keeps the tail of terminal output and says it was truncated", () => {
    const lines = Array.from({ length: CONTEXT_MENTION_MAX_LINES + 5 }, (_, index) => `line-${index}`)
    const truncated = truncateContextText(lines.join("\n"), { mode: "tail" })

    expect(truncated.truncated).toBe(true)
    expect(truncated.text.split("\n")).toHaveLength(CONTEXT_MENTION_MAX_LINES)
    expect(truncated.text.endsWith(`line-${lines.length - 1}`)).toBe(true)
    expect(truncated.text.startsWith("line-0")).toBe(false)
  })

  test("caps text to the byte budget without splitting a multibyte character", () => {
    const truncated = truncateContextText(`hello ${"🙂".repeat(100)}`, {
      mode: "tail",
      maxLines: 10,
      maxBytes: 8,
    })

    expect(truncated.truncated).toBe(true)
    expect(new TextEncoder().encode(truncated.text).length).toBeLessThanOrEqual(8)
    expect(truncated.text.includes("\uFFFD")).toBe(false)
  })

  test("formats attachment labels and removes the in-progress mention", () => {
    expect(formatTerminalOutputLabel("zsh")).toBe("Terminal output (zsh)")
    expect(formatTerminalOutputLabel("  ")).toBe("Terminal output (shell)")
    expect(UNCOMMITTED_CHANGES_LABEL).toBe("Uncommitted changes")
    expect(formatCommitLabel("abcdef1234567890", "Fix the composer")).toBe("Commit abcdef1: Fix the composer")
    expect(removeMentionQueryAtCursor("look at @term", 13)).toEqual({ newMessage: "look at ", nextCursor: 8 })
    expect(removeMentionQueryAtCursor("email me@host", 13)).toEqual({ newMessage: "email me@host", nextCursor: 13 })
  })

  test("filters the @ menu by term, diff, and commit", () => {
    expect(contextMentionKindsForQuery("")).toEqual(["terminal", "diff", "commit"])
    expect(contextMentionKindsForQuery("term")).toEqual(["terminal"])
    expect(contextMentionKindsForQuery("diff")).toEqual(["diff"])
    expect(contextMentionKindsForQuery("commit")).toEqual(["commit"])
    expect(contextMentionKindsForQuery("uncommitted")).toEqual(["diff"])
    expect(contextMentionKindsForQuery("src/file")).toEqual([])
    expect(commitListFilter("commit abc")).toBe("abc")
  })

  test("puts the active terminal first and skips empty idle tabs", () => {
    const targets = terminalMentionTargets({
      activeTabId: "tab-2",
      tabs: [
        { id: "tab-1", label: "zsh", terminalSessionId: "s1", bufferChunks: [{ data: "one" }] },
        { id: "tab-2", label: "bash", terminalSessionId: "s2", bufferChunks: [{ data: "two" }] },
        { id: "tab-3", label: "idle", terminalSessionId: null, bufferChunks: [] },
      ],
    })

    expect(targets.map((target) => target.tabId)).toEqual(["tab-2", "tab-1"])
    expect(targets[0]?.active).toBe(true)
  })

  test("prefers the server replay and falls back to the local buffer", async () => {
    const readServer = vi.fn(async () => ({ output: "\u001B[31mfrom-server\u001B[0m", shell: "zsh" }))
    const fromServer = await resolveTerminalContext({
      sessionId: "session",
      fallbackShell: "Terminal 1",
      localOutput: "local",
      readServer,
    })
    expect(fromServer).toEqual({ shell: "zsh", text: "from-server", truncated: false })

    const readServerFails = vi.fn(async () => {
      throw new Error("missing")
    })
    const fromLocal = await resolveTerminalContext({
      sessionId: "session",
      fallbackShell: "bash",
      localOutput: "local-only\n",
      readServer: readServerFails,
    })
    expect(fromLocal?.shell).toBe("bash")
    expect(fromLocal?.text).toBe("local-only\n")
  })

  test("builds a removable text file whose body carries the label", async () => {
    const body = composeContextBody("Terminal output (zsh)", "npm test", null, "before")
    const file = buildContextAttachmentFile("Terminal output (zsh)", body)

    expect(file.name).toBe("Terminal output (zsh)")
    expect(file.type).toBe("text/plain")
    expect(await readBlobText(file)).toBe("Terminal output (zsh)\n\nnpm test")
    expect(
      composeContextBody("Uncommitted changes", "diff", "Truncated to the first 200 lines and 16 KB.", "after"),
    ).toContain("Truncated to the first 200 lines and 16 KB.")
  })
})

describe("context mention git payloads", () => {
  test("joins staged and unstaged diffs and reports an empty tree", async () => {
    const git: ContextMentionGitClient = {
      getGitStatus: vi.fn(async () => ({
        isClean: false,
        files: [
          { path: "src/a.ts", index: "M", working_dir: " " },
          { path: "src/b.ts", index: " ", working_dir: "M" },
        ],
      })),
      getGitDiff: vi.fn(async (_directory: string, options: { path: string; staged?: boolean }) => ({
        diff: options.staged ? `diff --git a/${options.path}\nstaged` : `diff --git a/${options.path}\nunstaged`,
      })),
      getGitLog: vi.fn(async () => ({ all: [] })),
      getCommitPatch: vi.fn(async () => ({ patch: "", truncated: false })),
    }

    const payload = await resolveUncommittedContext(git, "/repo")
    expect(payload?.text).toContain("## Staged changes")
    expect(payload?.text).toContain("src/a.ts")
    expect(payload?.text).toContain("## Unstaged changes")
    expect(payload?.text).toContain("src/b.ts")
    expect(payload?.truncated).toBe(false)

    git.getGitStatus = vi.fn(async () => ({ isClean: true, files: [] }))
    expect(await resolveUncommittedContext(git, "/repo")).toBeNull()
  })

  test("attaches the commit as git show prints it", async () => {
    const git: ContextMentionGitClient = {
      getGitStatus: vi.fn(async () => ({ files: [] })),
      getGitDiff: vi.fn(async () => ({ diff: "" })),
      getGitLog: vi.fn(async () => ({
        all: [{ hash: "abcdef1234567890", message: "Fix the composer", body: "More detail" }],
      })),
      getCommitPatch: vi.fn(async () => ({
        patch:
          "commit abcdef1234567890\nAuthor: Ada <ada@example.com>\n\n    Fix the composer\n\n    More detail\n---\n src/a.ts | 2 +-\n\ndiff --git a/src/a.ts b/src/a.ts\n-old\n+new\n",
        truncated: false,
      })),
    }

    const [entry] = commitEntriesFromLog([
      { hash: "abcdef1234567890", message: "Fix the composer", body: "More detail" },
    ])
    const visible = filterCommitEntries([entry], "commit fix")
    expect(visible).toHaveLength(1)

    const payload = await resolveCommitContext(git, "/repo", entry)
    expect(payload?.text).toContain("Fix the composer")
    expect(payload?.text).toContain("More detail")
    expect(payload?.text).toContain("+new")
    expect(payload?.text).toContain("-old")
    expect(payload?.truncated).toBe(false)
    expect(git.getCommitPatch).toHaveBeenCalledWith("/repo", "abcdef1234567890")
  })

  test("keeps the server's truncation flag and returns null for an empty patch", async () => {
    const git: ContextMentionGitClient = {
      getGitStatus: vi.fn(async () => ({ files: [] })),
      getGitDiff: vi.fn(async () => ({ diff: "" })),
      getGitLog: vi.fn(async () => ({ all: [] })),
      getCommitPatch: vi.fn(async () => ({ patch: "commit abc\n", truncated: true })),
    }
    const entry = { hash: "abc1234", subject: "Fix", message: "Fix" }
    expect((await resolveCommitContext(git, "/repo", entry))?.truncated).toBe(true)
    git.getCommitPatch = vi.fn(async () => ({ patch: "  ", truncated: false }))
    expect(await resolveCommitContext(git, "/repo", entry)).toBeNull()
  })

  test("marks a diff truncated when it exceeds the byte cap", async () => {
    const git: ContextMentionGitClient = {
      getGitStatus: vi.fn(async () => ({
        isClean: false,
        files: [{ path: "big.ts", index: " ", working_dir: "M" }],
      })),
      getGitDiff: vi.fn(async () => ({ diff: `+${"x".repeat(CONTEXT_MENTION_MAX_BYTES + 50)}` })),
      getGitLog: vi.fn(async () => ({ all: [] })),
      getCommitPatch: vi.fn(async () => ({ patch: "", truncated: false })),
    }

    const payload = await resolveUncommittedContext(git, "/repo")
    expect(payload?.truncated).toBe(true)
    expect(new TextEncoder().encode(payload?.text ?? "").length).toBeLessThanOrEqual(CONTEXT_MENTION_MAX_BYTES)
  })
})
