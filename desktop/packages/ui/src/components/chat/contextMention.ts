// Context the composer can hand the agent from the @ menu: terminal output,
// the uncommitted git diff, and a chosen commit. The bytes travel as a
// text/plain file attachment — the same part the runtime already accepts for
// pasted files — not a new message part type.

import { detectMentionQueryAtCursor } from "./chatInputMentions"

export const CONTEXT_MENTION_MAX_LINES = 200
export const CONTEXT_MENTION_MAX_BYTES = 16 * 1024
export const CONTEXT_MENTION_MAX_STATUS_FILES = 40

export const DEFAULT_TAIL_TRUNCATION_NOTE = "Truncated to the last 200 lines and 16 KB."
export const DEFAULT_HEAD_TRUNCATION_NOTE = "Truncated to the first 200 lines and 16 KB."
export const UNCOMMITTED_CHANGES_LABEL = "Uncommitted changes"

const textEncoder = new TextEncoder()

const byteLength = (value: string): number => textEncoder.encode(value).length

export type ContextMentionKind = "terminal" | "diff" | "commit"

const CONTEXT_KEYWORDS: Record<ContextMentionKind, readonly string[]> = {
  terminal: ["terminal", "term", "output"],
  diff: ["diff", "uncommitted", "changes"],
  commit: ["commit", "commits"],
}

const keywordMatches = (query: string, keyword: string): boolean =>
  keyword.startsWith(query) || query === keyword || query.startsWith(`${keyword} `)

// Empty query lists every context source. A typed query keeps a source when it
// is a prefix of that source's keyword ("term") or continues past it ("commit abc").
export const contextMentionKindsForQuery = (query: string): ContextMentionKind[] => {
  const normalized = query.trim().toLowerCase()
  const kinds: ContextMentionKind[] = ["terminal", "diff", "commit"]
  if (!normalized) return kinds
  return kinds.filter((kind) => CONTEXT_KEYWORDS[kind].some((keyword) => keywordMatches(normalized, keyword)))
}

// Text after "commit" used to filter the second-level commit list.
export const commitListFilter = (query: string): string => {
  const normalized = query.trim().toLowerCase()
  if (normalized.startsWith("commits ")) return normalized.slice("commits ".length).trim()
  if (normalized.startsWith("commit ")) return normalized.slice("commit ".length).trim()
  return ""
}

export const shortCommitHash = (hash: string): string => hash.trim().slice(0, 7)

export const clipCommitSubject = (subject: string, maxLength = 72): string => {
  const oneLine = subject.replace(/\s+/g, " ").trim()
  if (oneLine.length <= maxLength) return oneLine
  return `${oneLine.slice(0, Math.max(0, maxLength - 3))}...`
}

export const formatTerminalOutputLabel = (shell: string): string => {
  const name = shell.trim() || "shell"
  return `Terminal output (${name})`
}

export const formatCommitLabel = (hash: string, subject: string): string => {
  const short = shortCommitHash(hash) || "unknown"
  const clipped = clipCommitSubject(subject) || "(no subject)"
  return `Commit ${short}: ${clipped}`
}

export const stripAnsi = (value: string): string => {
  // eslint-disable-next-line no-control-regex -- ANSI sequences are the characters being removed
  const osc = /\u001B\][\s\S]*?(?:\u0007|\u001B\\)/g
  // eslint-disable-next-line no-control-regex -- ANSI sequences are the characters being removed
  const csi = /\u001B\[[0-9;?]*[ -/]*[@-~]/g
  // eslint-disable-next-line no-control-regex -- ANSI sequences are the characters being removed
  const esc = /\u001B[@-Z\\-_]/g
  return value.replace(osc, "").replace(csi, "").replace(esc, "")
}

// Replay chunks are raw PTY bytes. Drop ANSI and turn bare carriage returns
// into newlines so progress updates stay readable as text.
export const plainTerminalText = (value: string): string => stripAnsi(value).replace(/\r\n/g, "\n").replace(/\r/g, "\n")

const trimToMaxBytes = (value: string, maxBytes: number, from: "start" | "end"): string => {
  if (byteLength(value) <= maxBytes) return value
  const characters = Array.from(value)
  const kept: string[] = []
  let size = 0
  const indexes = from === "end" ? [...characters.keys()].reverse() : [...characters.keys()]
  const ordered: string[] = []
  for (const index of indexes) {
    const character = characters[index]
    const characterBytes = byteLength(character)
    if (size + characterBytes > maxBytes) break
    ordered.push(character)
    size += characterBytes
  }
  if (from === "end") {
    kept.push(...ordered.reverse())
  } else {
    kept.push(...ordered)
  }
  return kept.join("")
}

const snapToLine = (value: string, from: "start" | "end", original: string): string => {
  if (value === original) return value
  if (from === "end") {
    const newline = value.indexOf("\n")
    if (newline >= 0 && newline < value.length - 1) return value.slice(newline + 1)
    return value
  }
  const newline = value.lastIndexOf("\n")
  if (newline > 0) return value.slice(0, newline)
  return value
}

export const truncateContextText = (
  value: string,
  options: { mode: "head" | "tail"; maxLines?: number; maxBytes?: number },
): { text: string; truncated: boolean } => {
  const maxLines = options.maxLines ?? CONTEXT_MENTION_MAX_LINES
  const maxBytes = options.maxBytes ?? CONTEXT_MENTION_MAX_BYTES
  const lines = value.split("\n")
  const lineLimited = options.mode === "tail" ? lines.slice(-maxLines) : lines.slice(0, maxLines)
  const lineTruncated = lineLimited.length !== lines.length
  const joined = lineLimited.join("\n")
  if (byteLength(joined) <= maxBytes) {
    return { text: joined, truncated: lineTruncated }
  }
  const from = options.mode === "tail" ? "end" : "start"
  const snapped = snapToLine(trimToMaxBytes(joined, maxBytes, from), from, joined)
  return { text: snapped, truncated: true }
}

export const composeContextBody = (
  label: string,
  content: string,
  note: string | null,
  placement: "before" | "after",
): string => {
  if (content.length === 0) return ""
  if (!note) return `${label}\n\n${content}`
  if (placement === "before") return `${label}\n\n${note}\n\n${content}`
  return `${label}\n\n${content}\n\n${note}`
}

export const buildContextAttachmentFile = (label: string, body: string): File =>
  new File([body], label, { type: "text/plain" })

// Drop the in-progress @query. File and agent mentions replace it with a token;
// context mentions become an attachment chip instead.
export const removeMentionQueryAtCursor = (
  message: string,
  cursorPosition: number,
): { newMessage: string; nextCursor: number } => {
  const textBeforeCursor = message.slice(0, cursorPosition)
  if (detectMentionQueryAtCursor(textBeforeCursor) === null) {
    return { newMessage: message, nextCursor: cursorPosition }
  }
  const lastAt = textBeforeCursor.lastIndexOf("@")
  return {
    newMessage: message.slice(0, lastAt) + message.slice(cursorPosition),
    nextCursor: lastAt,
  }
}

export interface TerminalMentionSourceTab {
  id: string
  label: string
  terminalSessionId: string | null
  bufferChunks: Array<{ data: string }>
}

export interface TerminalMentionTarget {
  tabId: string
  sessionId: string | null
  label: string
  active: boolean
  output: string
}

export const joinTerminalChunks = (chunks: Array<{ data: string }> | null | undefined): string =>
  (chunks ?? []).map((chunk) => chunk.data).join("")

export const terminalMentionTargets = (
  state: { tabs: TerminalMentionSourceTab[]; activeTabId: string | null } | null | undefined,
): TerminalMentionTarget[] => {
  if (!state) return []
  const targets = state.tabs.flatMap((tab) => {
    const output = joinTerminalChunks(tab.bufferChunks)
    const sessionId = tab.terminalSessionId
    if (!sessionId && output.length === 0) return []
    return [
      {
        tabId: tab.id,
        sessionId,
        label: tab.label.trim() || "shell",
        active: tab.id === state.activeTabId,
        output,
      } satisfies TerminalMentionTarget,
    ]
  })
  return [...targets.filter((target) => target.active), ...targets.filter((target) => !target.active)]
}

export interface TerminalOutputSnapshot {
  output: string
  shell: string
}

export const resolveTerminalContext = async (input: {
  sessionId: string | null
  fallbackShell: string
  localOutput: string
  readServer?: (sessionId: string) => Promise<TerminalOutputSnapshot>
}): Promise<{ shell: string; text: string; truncated: boolean } | null> => {
  let raw = input.localOutput
  let shell = input.fallbackShell
  if (input.sessionId && input.readServer) {
    try {
      const snapshot = await input.readServer(input.sessionId)
      if (snapshot.shell.trim()) shell = snapshot.shell.trim()
      if (snapshot.output.length > 0) raw = snapshot.output
    } catch {
      // The PTY may already be gone. The client's replay chunks are the fallback.
    }
  }
  const plain = plainTerminalText(raw)
  if (plain.trim().length === 0) return null
  const truncated = truncateContextText(plain, { mode: "tail" })
  return { shell: shell.trim() || "shell", text: truncated.text, truncated: truncated.truncated }
}

export interface ContextMentionGitClient {
  getGitStatus: (
    directory: string,
    options?: { mode?: "light" },
  ) => Promise<{ files?: Array<{ path: string; index: string; working_dir: string }>; isClean?: boolean }>
  getGitDiff: (directory: string, options: { path: string; staged?: boolean }) => Promise<{ diff?: string }>
  getGitLog: (
    directory: string,
    options?: { maxCount?: number },
  ) => Promise<{ all?: Array<{ hash: string; message?: string; body?: string }> }>
  /** One commit as `git show --stat --patch` prints it (header and message included). */
  getCommitPatch: (directory: string, hash: string) => Promise<{ patch?: string; truncated?: boolean }>
}

const capPatch = (diff: string): { text: string; truncated: boolean } => {
  if (byteLength(diff) <= CONTEXT_MENTION_MAX_BYTES) return { text: diff, truncated: false }
  return { text: trimToMaxBytes(diff, CONTEXT_MENTION_MAX_BYTES, "start"), truncated: true }
}

const isStagedStatus = (index: string): boolean => index !== " " && index !== "?" && index !== ""
const isUnstagedStatus = (workingDir: string): boolean => workingDir !== " " && workingDir !== ""

export const resolveUncommittedContext = async (
  git: ContextMentionGitClient,
  directory: string,
): Promise<{ text: string; truncated: boolean } | null> => {
  const status = await git.getGitStatus(directory, { mode: "light" })
  const files = (status.files ?? []).filter((file) => file.path.trim().length > 0)
  if (files.length === 0 || status.isClean) return null

  const limited = files.slice(0, CONTEXT_MENTION_MAX_STATUS_FILES)
  const omittedByCount = files.length > limited.length
  const staged: string[] = []
  const unstaged: string[] = []
  let truncated = false

  for (const file of limited) {
    if (byteLength([...staged, ...unstaged].join("\n")) > CONTEXT_MENTION_MAX_BYTES) {
      truncated = true
      break
    }
    if (isStagedStatus(file.index)) {
      try {
        const response = await git.getGitDiff(directory, { path: file.path, staged: true })
        const patch = capPatch(response.diff ?? "")
        if (patch.text.trim()) staged.push(patch.text.trimEnd())
        truncated = truncated || patch.truncated
      } catch {
        truncated = true
      }
    }
    if (isUnstagedStatus(file.working_dir)) {
      try {
        const response = await git.getGitDiff(directory, { path: file.path, staged: false })
        const patch = capPatch(response.diff ?? "")
        if (patch.text.trim()) unstaged.push(patch.text.trimEnd())
        truncated = truncated || patch.truncated
      } catch {
        truncated = true
      }
    }
  }

  const sections = [
    staged.length > 0 ? `## Staged changes\n\n${staged.join("\n\n")}` : "",
    unstaged.length > 0 ? `## Unstaged changes\n\n${unstaged.join("\n\n")}` : "",
    omittedByCount ? "Additional files were omitted." : "",
  ].filter((section) => section.length > 0)
  if (sections.length === 0) return null
  const capped = truncateContextText(sections.join("\n\n"), { mode: "head" })
  return { text: capped.text, truncated: truncated || capped.truncated }
}

export interface CommitMentionEntry {
  hash: string
  subject: string
  message: string
}

export const commitEntriesFromLog = (
  entries: Array<{ hash: string; message?: string; body?: string }> | null | undefined,
): CommitMentionEntry[] =>
  (entries ?? [])
    .filter((entry) => entry.hash.trim().length > 0)
    .map((entry) => {
      const message = (entry.message ?? "").replace(/\r\n/g, "\n").trim()
      const body = (entry.body ?? "").replace(/\r\n/g, "\n").trim()
      const subject = message.split("\n")[0]?.trim() || body.split("\n")[0]?.trim() || ""
      const text = [message, body && body !== message ? body : ""].filter((part) => part.length > 0).join("\n\n")
      return { hash: entry.hash.trim(), subject, message: text || subject }
    })

export const filterCommitEntries = <T extends { hash: string; subject: string }>(entries: T[], query: string): T[] => {
  const filter = commitListFilter(query)
  if (!filter) return entries
  return entries.filter((entry) => `${entry.hash} ${entry.subject}`.toLowerCase().includes(filter))
}

export const resolveCommitContext = async (
  git: ContextMentionGitClient,
  directory: string,
  entry: CommitMentionEntry,
): Promise<{ text: string; truncated: boolean } | null> => {
  const response = await git.getCommitPatch(directory, entry.hash)
  const patch = (response.patch ?? "").trimEnd()
  if (!patch) return null
  const capped = truncateContextText(patch, { mode: "head" })
  return { text: capped.text, truncated: Boolean(response.truncated) || capped.truncated }
}
