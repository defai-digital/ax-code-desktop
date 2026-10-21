import { useWebMcpBrowserStore } from "@/stores/useWebMcpBrowserStore"
import { webMcpDefinitionForDigest } from "@/lib/webMcpCatalog"

/** Approval hints require a current, unambiguous main-issued binding in this session and origin. */
export function useWebMcpApprovalDefinition(sessionID: string, origin: string, digest: string | null) {
  return useWebMcpBrowserStore((state) => webMcpDefinitionForDigest(
    Object.values(state.views).filter((view) => view.sessionID === sessionID && view.origin === origin)
      .flatMap((view) => view.catalog),
    digest,
  ))
}
