import { webMcpDisplayText } from "../../../../shared/webmcp-redaction.mjs"
import { useConfirmDialog } from "@/components/ui/ConfirmDialog"
import { getDesktopBridge } from "@/lib/desktopBridge"
import { useI18n } from "@/lib/i18n"

type CloseReply = {
  confirmationRequired?: boolean
  closeConfirmation?: string
  pages?: { id: string; sessionID: string | null; title: string }[]
}

/** Main binds each one-use confirmation to the affected documents, action and owner. */
export function useWebMcpCloseConfirmation() {
  const { requestConfirm, confirmDialog } = useConfirmDialog()
  const { t } = useI18n()
  const invoke = async <T,>(args: Record<string, unknown>): Promise<T | null> => {
    const bridge = getDesktopBridge()
    if (!bridge?.invoke) throw new Error("Browser unavailable")
    let reply = await bridge.invoke<T & CloseReply>("desktop_webmcp_browser", args)
    while (reply?.confirmationRequired) {
      const pages = (reply.pages ?? []).map((page) => `${page.sessionID ?? page.id} · ${webMcpDisplayText(page.title)} · ${page.id}`).join("\n")
      if (!(await requestConfirm(t("webmcp.browser.confirmClose", { pages }), { destructive: true }))) return null
      reply = await bridge.invoke<T & CloseReply>("desktop_webmcp_browser", { ...args, closeConfirmation: reply.closeConfirmation })
    }
    return reply
  }
  return { invoke, confirmDialog }
}
