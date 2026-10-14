import { createContext } from "react"

import type { Part } from "@defai-digital/ax-code-sdk/v2"
import { extractTextContent, filterVisibleParts, isEmptyTextPart } from "../../message/partUtils"
import { isActiveToolPart, isFinalizedToolPart } from "../../message/toolPartState"

// While a turn works with Activity collapsed, only its latest rows stay in
// view and the earlier ones fold into one "+N more" row. A row is what
// MessageBody draws for one part: a text, a reasoning block, a tool call.

export const LIVE_ACTIVITY_VISIBLE_ROWS = 7

export interface ActivityRowOptions {
  showReasoningTraces: boolean
  collapsibleThinkingBlocks: boolean
  groupReasoningBlocks: boolean
}

interface ActivityTrim {
  // Messages at the start of the turn that are hidden entirely.
  readonly hiddenMessages: number
  // Rows hidden at the start of the first message still shown.
  readonly skipRows: number
  readonly hiddenRows: number
}

const NO_TRIM: ActivityTrim = { hiddenMessages: 0, skipRows: 0, hiddenRows: 0 }

/** Which rows to hide so that the last `visibleRows` of the turn stay. */
export const planActivityTrim = (rowsPerMessage: readonly number[], visibleRows: number): ActivityTrim => {
  let kept = 0
  for (let index = rowsPerMessage.length - 1; index >= 0; index -= 1) {
    const rows = rowsPerMessage[index] ?? 0
    if (kept + rows <= visibleRows) {
      kept += rows
      continue
    }
    let hiddenRows = 0
    for (let earlier = 0; earlier <= index; earlier += 1) hiddenRows += rowsPerMessage[earlier] ?? 0
    const skipRows = rows - (visibleRows - kept)
    // The budget ran out exactly at this message: it is hidden whole.
    if (skipRows >= rows) return { hiddenMessages: index + 1, skipRows: 0, hiddenRows }
    return { hiddenMessages: index, skipRows, hiddenRows: hiddenRows - (rows - skipRows) }
  }
  return NO_TRIM
}

/**
 * Parts MessageBody walks for one message: visible parts, without empty text
 * or compaction. Grouped reasoning stays in the list and counts as one row.
 */
export const activityRowVisibleParts = (parts: Part[], options: ActivityRowOptions): Part[] => {
  return filterVisibleParts(parts, { includeReasoning: options.showReasoningTraces }).filter((part) => {
    if (isEmptyTextPart(part)) return false
    // ReasoningPart renders nothing without text, so counting an empty reasoning part
    // would make the collapsed trim hide one row more than it should.
    if (part.type === "reasoning") {
      const text = extractTextContent(part)
      return Boolean(text && text.trim().length > 0)
    }
    return part.type !== "compaction"
  })
}

/** Row elements MessageBody draws for `parts` under the same visibility flags. */
export const countActivityRows = (parts: Part[], options: ActivityRowOptions): number => {
  const visible = activityRowVisibleParts(parts, options)
  let rows = 0
  let reasoning = 0
  for (const part of visible) {
    if (part.type === "text") {
      rows += 1
      continue
    }
    if (part.type === "reasoning") {
      if (!options.showReasoningTraces) continue
      reasoning += 1
      continue
    }
    if (part.type === "tool" && (isActiveToolPart(part) || isFinalizedToolPart(part))) {
      rows += 1
    }
  }
  if (reasoning === 0) return rows
  // Collapsed, grouped thinking is one block for every reasoning part together.
  if (options.collapsibleThinkingBlocks && options.groupReasoningBlocks) return rows + 1
  return rows + reasoning
}

/** The message the trim cuts into, and how many of its first rows it hides. */
export const ActivityRowSkipContext = createContext<{ messageId: string; rows: number } | null>(null)
