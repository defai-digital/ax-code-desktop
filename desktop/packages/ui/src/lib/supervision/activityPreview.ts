import { truncateToCodeUnits } from "@/lib/textTruncate"

/** Preview strings stay short enough for one Mission Control line. The ellipsis counts toward the limit. */
export const ACTIVITY_PREVIEW_LIMIT = 140

/** English prefix for an in-progress todo. The row renders the same words through i18n. */
export const ACTIVITY_TODO_PREFIX = "Working on: "

export interface ActivityPreview {
  kind: "todo" | "message"
  text: string
}

export interface ActivityTodo {
  status?: string
  content?: string
}

export interface ActivityMessage {
  id?: string
  role?: string
}

export interface ActivityPart {
  type?: string
  text?: string
  ignored?: boolean
}

export interface ActivityParts {
  get(messageId: string): readonly ActivityPart[] | undefined
}

export interface ActivityPreviewInput {
  todos?: readonly ActivityTodo[] | null
  /** Absent when this session's messages have not been loaded. An empty array means loaded and empty. */
  messages?: readonly ActivityMessage[] | null
  parts?: ActivityParts | null
}

export interface ActivityTarget {
  sessionId: string
  directory: string | null
}

export interface ActivityDirectory {
  directory: string
  todo: Readonly<Record<string, readonly ActivityTodo[] | undefined>>
  message: Readonly<Record<string, readonly ActivityMessage[] | undefined>>
  part: ActivityParts
}

const EMPTY_ACTIVITY_PREVIEWS: ReadonlyMap<string, ActivityPreview> = new Map()

const CREDENTIALS: readonly RegExp[] = [
  /-----BEGIN [A-Z0-9 ]*PRIVATE KEY-----/,
  /\b(?:sk|rk)-[A-Za-z0-9][A-Za-z0-9_-]{16,}/,
  /\b(?:ghp|gho|ghu|ghs|ghr|github_pat)_[A-Za-z0-9_]{16,}/,
  /\bxox[baprs]-[A-Za-z0-9-]{10,}/,
  /\bAKIA[0-9A-Z]{16}\b/,
  /\bBearer\s+\S{16,}/i,
  /\beyJ[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}/,
  /\b(?:api[_-]?key|secret|token|password|passwd|access[_-]?key)\s*[:=]\s*['"]?\S{8,}/i,
]

const looksLikeCredential = (value: string): boolean => CREDENTIALS.some((pattern) => pattern.test(value))

const collapsed = (value: string): string => value.replace(/\s+/g, " ").trim()

/** First non-empty line, with whitespace collapsed, capped at the preview limit. Null when it looks like a credential. */
export const previewLine = (value: string): string | null => {
  if (looksLikeCredential(value)) return null
  for (const line of value.split(/\r?\n/)) {
    const text = collapsed(line)
    if (!text || looksLikeCredential(text)) continue
    return truncateToCodeUnits(text, ACTIVITY_PREVIEW_LIMIT)
  }
  return null
}

const inProgressTodo = (todos: readonly ActivityTodo[] | null | undefined): string | null => {
  if (!Array.isArray(todos)) return null
  for (const todo of todos) {
    if (todo?.status !== "in_progress" || typeof todo.content !== "string") continue
    const content = collapsed(todo.content)
    if (!content || looksLikeCredential(content)) continue
    return `${ACTIVITY_TODO_PREFIX}${content}`
  }
  return null
}

const latestAssistantText = (messages: readonly ActivityMessage[], parts: ActivityParts): string | null => {
  for (let index = messages.length - 1; index >= 0; index -= 1) {
    const message = messages[index]
    if (!message || message.role !== "assistant" || !message.id) continue
    const messageParts = parts.get(message.id)
    if (!messageParts) continue
    for (let partIndex = messageParts.length - 1; partIndex >= 0; partIndex -= 1) {
      const part = messageParts[partIndex]
      // Tool output, reasoning and file parts stay out of the preview. Only assistant text is shown.
      if (!part || part.type !== "text" || part.ignored || typeof part.text !== "string") continue
      const text = previewLine(part.text)
      if (text) return text
    }
  }
  return null
}

/**
 * Prefer the session's in-progress todo. Otherwise the latest assistant text part, once that
 * session's parts are loaded. Returns null when nothing safe is loaded yet.
 */
export function activityPreview(input: ActivityPreviewInput): ActivityPreview | null {
  const todo = inProgressTodo(input.todos)
  if (todo) return { kind: "todo", text: todo }
  if (!Array.isArray(input.messages) || !input.parts) return null
  const text = latestAssistantText(input.messages, input.parts)
  if (!text) return null
  return { kind: "message", text }
}

const directoryFor = (
  target: ActivityTarget,
  directories: readonly ActivityDirectory[],
): ActivityDirectory | undefined => {
  if (target.directory) {
    const named = directories.find((entry) => entry.directory === target.directory)
    if (named) return named
  }
  return directories.find(
    (entry) =>
      Object.prototype.hasOwnProperty.call(entry.todo, target.sessionId) ||
      Object.prototype.hasOwnProperty.call(entry.message, target.sessionId),
  )
}

/** One preview per root session, omitting sessions with nothing safe to show. */
export function collectActivityPreviews(
  targets: readonly ActivityTarget[],
  directories: readonly ActivityDirectory[],
): Map<string, ActivityPreview> {
  const previews = new Map<string, ActivityPreview>()
  for (const target of targets) {
    const source = directoryFor(target, directories)
    const loaded = source ? Object.prototype.hasOwnProperty.call(source.message, target.sessionId) : false
    const preview = activityPreview({
      todos: source?.todo[target.sessionId],
      messages: loaded ? (source?.message[target.sessionId] ?? []) : undefined,
      parts: source?.part,
    })
    if (preview) previews.set(target.sessionId, preview)
  }
  return previews
}

/** Slice references the preview reads. Unrelated store updates leave this list unchanged. */
export function activitySliceDeps(
  targets: readonly ActivityTarget[],
  directories: readonly ActivityDirectory[],
): readonly unknown[] {
  const deps: unknown[] = []
  for (const source of directories) {
    deps.push(source.todo, source.message, source.part)
    for (const target of targets) {
      const messages = source.message[target.sessionId]
      deps.push(source.todo[target.sessionId], messages)
      if (!messages) continue
      for (const message of messages) {
        if (!message || message.role !== "assistant" || !message.id) continue
        deps.push(source.part.get(message.id))
      }
    }
  }
  return deps
}

const sameActivity = (left: ReadonlyMap<string, ActivityPreview>, right: ReadonlyMap<string, ActivityPreview>): boolean => {
  if (left.size !== right.size) return false
  for (const [sessionId, preview] of left) {
    const other = right.get(sessionId)
    if (!other || other.kind !== preview.kind || other.text !== preview.text) return false
  }
  return true
}

/**
 * Keep the previous map when the preview text did not change, so a streaming token
 * that lands past the truncated line does not publish a new row array.
 */
export function retainActivityMap(
  previous: ReadonlyMap<string, ActivityPreview> | null,
  next: Map<string, ActivityPreview>,
): ReadonlyMap<string, ActivityPreview> {
  if (next.size === 0) return previous && previous.size === 0 ? previous : EMPTY_ACTIVITY_PREVIEWS
  if (previous && sameActivity(previous, next)) return previous
  if (previous) {
    for (const [sessionId, preview] of next) {
      const prior = previous.get(sessionId)
      if (prior && prior.kind === preview.kind && prior.text === preview.text) next.set(sessionId, prior)
    }
  }
  return next
}
