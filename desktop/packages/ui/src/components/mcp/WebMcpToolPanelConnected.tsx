import { useWebMcpTranscriptCalls } from "@/hooks/useWebMcpTranscriptCalls"
import { WebMcpToolPanel, type TryTool } from "./WebMcpToolPanel"

/** Page tools for the open browser view, with the session transcript's calls beside manual runs. */
export function WebMcpToolPanelConnected({
  tryTool,
  viewKey,
  sessionID,
  directory,
}: {
  tryTool: TryTool
  viewKey?: string
  sessionID: string | null
  directory: string
}) {
  const agentCalls = useWebMcpTranscriptCalls(sessionID, directory)
  return <WebMcpToolPanel tryTool={tryTool} viewKey={viewKey} agentCalls={agentCalls} />
}
