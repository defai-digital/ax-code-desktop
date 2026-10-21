export type InlineCommentSource = "diff" | "plan" | "file" | "preview-console" | "preview-annotation"

/** A comment written on a diff, plan or file selection before it is sent to an agent. */
export interface InlineCommentDraft {
  id: string
  sessionKey: string // sessionId or scoped draft key for new sessions
  source: InlineCommentSource
  fileLabel: string // filename or 'plan'
  startLine: number
  endLine: number
  side?: "original" | "modified" // diff only
  code: string
  language: string
  text: string
  createdAt: number
}
