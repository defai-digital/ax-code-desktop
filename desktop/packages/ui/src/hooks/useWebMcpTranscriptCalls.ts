import { webMcpKnownDefinitions } from "@/lib/webMcpCatalog"
import { useWebMcpBrowserStore } from "@/stores/useWebMcpBrowserStore"
import { viewKeyFor } from "@/lib/webMcpViewKey"
import React from "react"

import { collectWebMcpCalls, type WebMcpCall } from "@/lib/webMcpCalls"
import { useDirectorySync, useSessionMessages } from "@/sync/sync-context"

/**
 * The session's recent page-tool calls, from the transcript Desktop already holds.
 * Returns an empty list when no session is selected. Arguments stay the redacted transcript text.
 */
export function useWebMcpTranscriptCalls(sessionID: string | null, directory: string): WebMcpCall[] {
  const view = useWebMcpBrowserStore((state) =>
    state.views[viewKeyFor(directory, sessionID)] ??
    (state.order.length === 0 && state.sessionID === sessionID ? state : null))
  const definitions = React.useMemo(() => webMcpKnownDefinitions(view), [view])
  const messages = useSessionMessages(sessionID ?? "", directory)
  const signature = useDirectorySync(
    React.useCallback(
      (state: { part: Map<string, unknown[]> }) =>
        sessionID
          ? JSON.stringify(collectWebMcpCalls(messages as never, (id) => state.part.get(id) as never, 20, undefined, definitions))
          : "[]",
      [messages, sessionID, definitions],
    ) as never,
    directory,
  ) as unknown as string
  return React.useMemo(() => JSON.parse(signature) as WebMcpCall[], [signature])
}
