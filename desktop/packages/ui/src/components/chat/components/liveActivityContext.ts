import { createContext } from "react"

/** Only the final message splits its non-text parts from its answer/footer. */
export const LiveFinalActivityContext = createContext<{
  messageId: string
  expanded: boolean
  contentId: string
  animateCollapse: boolean
  /** Whether the turn has activity before this message, so the answer gets a divider. */
  hasEarlierActivity: boolean
} | null>(null)
