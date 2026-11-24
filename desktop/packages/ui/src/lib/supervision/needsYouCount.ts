import { countSessionsWithWaitingPages, webMcpPageNeedsYou } from "@/lib/webMcpViewKey"
import { needsHuman, type SupervisionState } from "./sessionState"

export interface NeedsYouCountRow {
  sessionId: string
  directory: string | null
  state: SupervisionState
}

export interface NeedsYouCountView {
  browserId?: unknown
  directory?: string | null
  sessionID: string | null
  waiting: boolean
  visible: boolean
}

/**
 * How many things need a person: sessions waiting on a decision (an approval, a question or a blocked goal, child
 * sessions rolled up into their root), plus project-browser pages waiting for a person that no such session already
 * covers. The dock badge, the window title and the titlebar pill all show this number (G UX-03). Before, the dock
 * counted requests, so three approvals in one session were 3 there and 1 on the pill, and a blocked goal never
 * reached the dock.
 */
export function countNeedsYou(
  rows: readonly NeedsYouCountRow[],
  views: Readonly<Record<string, NeedsYouCountView>>,
): number {
  const waitingPages = Object.entries(views)
    .filter(([, view]) => Boolean(view.browserId) && Boolean(view.directory))
    .map(([key, view]) => ({ key, sessionID: view.sessionID, waiting: view.waiting, visible: view.visible }))
    .filter(webMcpPageNeedsYou)
  return countSessionsWithWaitingPages(
    rows.filter((row) => needsHuman(row.state)),
    waitingPages,
  )
}
