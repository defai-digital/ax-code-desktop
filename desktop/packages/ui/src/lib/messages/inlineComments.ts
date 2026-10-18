import type { InlineCommentDraft } from "@/stores/useInlineCommentDraftStore"

/**
 * A fence longer than any backtick run in the code, so a snippet that itself contains a fence does
 * not close the block early: the selected code then swallows the comment as code, and the model
 * cannot tell the annotation from what it annotates.
 */
function fenceFor(code: string): string {
  const runs = [...code.matchAll(/`{3,}/g)].map((match) => match[0].length)
  return "`".repeat(Math.max(3, ...runs.map((run) => run + 1), 3))
}

/** A code span whose delimiter cannot be closed by a backtick inside the value. */
function codeSpanFor(value: string): string {
  const runs = [...value.matchAll(/`+/g)].map((match) => match[0].length)
  const ticks = "`".repeat(Math.max(1, ...runs.map((run) => run + 1)))
  return `${ticks}${value}${ticks}`
}

/**
 * Format a single inline comment draft into the standard message format
 * used by diff, plan, and file viewers
 */
function formatInlineCommentDraft(draft: InlineCommentDraft): string {
  const { fileLabel, startLine, endLine, side, language, code, text } = draft
  const fence = fenceFor(code)

  // Diff format includes side (original/modified)
  if (draft.source === "diff" && side) {
    return `Comment on ${codeSpanFor(fileLabel)} lines ${startLine}-${endLine} (${side}):\n${fence}${language}\n${code}\n${fence}\n\n${text}`
  }

  if (draft.source === "preview-console") {
    return `Attached preview context from ${codeSpanFor(fileLabel)}:\n${fence}${language}\n${code}\n${fence}\n\n${text}`
  }

  if (draft.source === "preview-annotation") {
    return text ? `${code}\n\n${text}` : code
  }

  // Plan and file format (no side)
  return `Comment on ${codeSpanFor(fileLabel)} lines ${startLine}-${endLine}:\n${fence}${language}\n${code}\n${fence}\n\n${text}`
}

/**
 * Format multiple inline comment drafts into a single string
 * with each comment separated by a blank line
 */
export function formatInlineCommentDrafts(drafts: InlineCommentDraft[]): string {
  if (drafts.length === 0) return ""

  if (drafts.every((draft) => draft.source === "preview-annotation")) {
    return drafts.map(formatInlineCommentDraft).join("\n\n---\n\n")
  }

  return drafts.map(formatInlineCommentDraft).join("\n\n")
}

/**
 * Append inline comment drafts to an existing message text
 * If the text is empty, returns just the formatted comments
 * Otherwise, appends comments after a blank line separator
 */
export function appendInlineComments(text: string, drafts: InlineCommentDraft[]): string {
  if (drafts.length === 0) return text

  const formattedComments = formatInlineCommentDrafts(drafts)

  if (!text.trim()) {
    return formattedComments
  }

  return `${text}\n\n${formattedComments}`
}
