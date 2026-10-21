import { useWebMcpBrowserValue } from "@/hooks/useWebMcpBrowser"
import React from "react"
import { Icon } from "@/components/icon/Icon"
import { Button } from "@/components/ui/button"
import { useI18n } from "@/lib/i18n"
import { isElectronShell } from "@/lib/desktop"
import { useChatSurfaceMode } from "@/components/chat/useChatSurfaceMode"
import { useOpenProjectBrowser } from "@/hooks/useWebMcpBrowser"

/**
 * Shown under a failed `desktop_webmcp` call. The tool cannot open or attach to the
 * project browser itself, so without this the error is a dead end; the button runs
 * the same one-click open-and-enable flow as the composer chip, with the click as
 * the user's consent. Hidden once the browser is enrolled with a grantable page —
 * the failure was then something else (descriptor drift, invocation rejection) —
 * and in the mini chat, which has no browser pane to answer the request.
 */
export const WebMcpBrowserErrorAction: React.FC = () => {
  const { t } = useI18n()
  const surfaceMode = useChatSurfaceMode()
  const enabled = useWebMcpBrowserValue((state) => state.enabled)
  const origin = useWebMcpBrowserValue((state) => state.origin)
  const busy = useWebMcpBrowserValue((state) => state.busy)
  const openProjectBrowser = useOpenProjectBrowser()

  if (!isElectronShell() || surfaceMode === "mini-chat" || (enabled && origin)) {
    return null
  }

  return (
    <Button
      type="button"
      size="xs"
      variant="outline"
      className="mt-1.5 gap-1.5"
      disabled={busy}
      onClick={() => openProjectBrowser({ enable: !enabled })}
    >
      <Icon name="ax-browser" className="h-3.5 w-3.5" />
      {enabled ? t("webmcp.actions.open") : t("webmcp.actions.enable")}
    </Button>
  )
}
