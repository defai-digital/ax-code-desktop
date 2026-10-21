import { useI18n } from "@/lib/i18n"
import { openExternalUrl } from "@/lib/url"
import { useWebMcpBrowserStore } from "@/stores/useWebMcpBrowserStore"

/** The public guide for making a page agent-usable (docs/webmcp-page-tools.md). */
export const WEBMCP_PAGE_TOOLS_GUIDE_URL =
  "https://github.com/defai-digital/ax-code-desktop/blob/main/docs/webmcp-page-tools.md"

/**
 * Points a builder at the page-tools guide wherever a page is open, and says so plainly when the page registers nothing,
 * which is when the guide is most needed.
 */
export function WebMcpBuilderHint() {
  const { t } = useI18n()
  const origin = useWebMcpBrowserStore((state) => state.origin)
  const toolCount = useWebMcpBrowserStore((state) => state.catalog.length)
  if (!origin) return null
  return (
    <p className="flex flex-wrap items-center gap-x-2 border-b border-border/40 px-2.5 py-1 typography-micro text-muted-foreground" data-webmcp-builder-hint>
      {toolCount === 0 ? <span>{t("webmcp.tools.noneRegistered")}</span> : null}
      <a
        href={WEBMCP_PAGE_TOOLS_GUIDE_URL}
        className="text-[var(--status-info)] hover:underline"
        onClick={(event) => {
          event.preventDefault()
          void openExternalUrl(WEBMCP_PAGE_TOOLS_GUIDE_URL)
        }}
      >
        {t("webmcp.tools.guide")}
      </a>
    </p>
  )
}
