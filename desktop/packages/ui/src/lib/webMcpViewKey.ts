import { viewKeyFor } from "../../../../shared/webmcp-view-key.mjs"
export { projectKeyFor, viewKeyFor } from "../../../../shared/webmcp-view-key.mjs"

/** A runtime row without a directory still represents its globally identified session. */
export function countSessionsWithWaitingPages(
  rows: { sessionId: string; directory: string | null }[],
  pages: { key: string; sessionID: string | null }[],
) {
  const keys = new Set(rows.map((row) => viewKeyFor(row.directory ?? "", row.sessionId)))
  return (
    keys.size +
    pages.filter(
      (page) =>
        !rows.some(
          (row) =>
            row.sessionId === page.sessionID &&
            (!row.directory || viewKeyFor(row.directory, row.sessionId) === page.key),
        ),
    ).length
  )
}

/** The same waiting-page attention rule used by Needs you and per-session supervision chips. */
export const webMcpPageNeedsYou = (page: { waiting: boolean; visible: boolean }) => page.waiting && !page.visible
