import { webMcpDisplayText as redactWebMcpText } from "../../../../../shared/webmcp-redaction.mjs"
import React from "react"
import { WebMcpCancellationStatus, type WebMcpCancellation } from "./WebMcpCancellationStatus"
import { useI18n } from "@/lib/i18n"
import { getDesktopBridge } from "@/lib/desktopBridge"
import { useWebMcpCloseConfirmation } from "@/hooks/useWebMcpCloseConfirmation"
import { pageAccess, showWebMcpPage, useWebMcpPages } from "@/hooks/useWebMcpPages"
import { useWebMcpBrowserStore } from "@/stores/useWebMcpBrowserStore"
import { viewKeyFor } from "@/lib/webMcpViewKey"

const buttonClass =
  "rounded border border-border px-2 py-1 typography-micro hover:bg-interactive-hover focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--interactive-focus-ring)]"

export function WebMcpPageSwitcher({ selectedKey, onRetry }: { selectedKey: string; onRetry: () => void }) {
  const { t } = useI18n()
  const { invoke, confirmDialog } = useWebMcpCloseConfirmation()
  const pages = useWebMcpPages()
  const capacity = useWebMcpBrowserStore((state) => state.capacity)
  const [pending, setPending] = React.useState<string | null>(null)
  const [cancellations, setCancellations] = React.useState<Record<string, WebMcpCancellation[]>>({})
  const [failed, setFailed] = React.useState(false)
  const disclosure = React.useRef<HTMLDetailsElement>(null)
  const otherWindows = capacity?.otherWindows ?? []
  const full = capacity !== null && capacity.liveViews >= capacity.maxLiveViews
  const act = async (key: string, action: "revokeSession" | "close") => {
    const page = pages.find((page) => page.key === key)
    if (!page || pending) return
    const focused = document.activeElement
    const focusTarget = focused?.closest("li")?.querySelector<HTMLButtonElement>("button")
    setPending(key)
    setFailed(false)
    setCancellations((previous) => ({ ...previous, [key]: [] }))
    try {
      const result = await invoke<{ cancellations?: WebMcpCancellation[] }>(
        action === "revokeSession"
          ? { action, directory: page.directory, sessionID: page.sessionID }
          : { action, id: page.browserId },
      )
      if (!result) return
      if (action === "revokeSession")
        setCancellations((previous) => ({ ...previous, [key]: result?.cancellations ?? [] }))
      const store = useWebMcpBrowserStore.getState()
      if (store.views[key]?.browserId === page.browserId) {
        if (action === "close") store.resetView(key)
        else store.updateView(key, { enabled: false, paused: false, waiting: false, interrupted: false })
      }
      if (action === "close") onRetry()
    } catch {
      setFailed(true)
    } finally {
      setPending(null)
      if (document.activeElement === focused || document.activeElement === document.body) {
        const target = focusTarget?.isConnected
          ? focusTarget
          : disclosure.current?.querySelector<HTMLElement>("summary")
        target?.focus()
      }
    }
  }
  const poolMessage = full
    ? t(otherWindows.length ? "webmcp.pages.fullOtherWindows" : "webmcp.pages.full", { count: capacity.maxLiveViews })
    : ""
  const announcements = pages
    .filter((page) => page.waiting || page.interrupted)
    .map(
      (page) => `${page.title} · ${page.sessionID} · ${page.project}: ${t(`webmcp.pages.access.${pageAccess(page)}`)}`,
    )
  return (
    <>
      {confirmDialog}
      <div role="status" aria-live="polite" aria-atomic="true" className="sr-only" data-webmcp-pages-status>
        {[poolMessage, ...announcements].filter(Boolean).join(". ")}
      </div>
      <details ref={disclosure} className="shrink-0 border-b border-border p-2 typography-meta" data-webmcp-pages>
        <summary className="cursor-pointer focus-visible:outline-none focus-visible:ring-2">
          {t("webmcp.pages.title", { count: pages.length })}
          {full ? ` · ${t("webmcp.pages.fullLabel")}` : ""}
          {pages.some((page) => page.waiting) ? ` · ${t("webmcp.pages.waiting")}` : ""}
        </summary>
        {full && <p className="py-1">{poolMessage}</p>}
        {full &&
          otherWindows.map((owner, index) => (
            <button
              key={owner.id}
              type="button"
              className={buttonClass}
              onClick={async () => {
                setFailed(false)
                try {
                  const invoke = getDesktopBridge()?.invoke
                  if (!invoke) throw new Error("Browser unavailable")
                  await invoke("desktop_webmcp_browser", { action: "focusOwner", id: owner.id })
                } catch {
                  setFailed(true)
                }
              }}
            >
              {t("webmcp.pages.focusWindow", { window: index + 1, count: owner.pageCount })}
            </button>
          ))}
        <ul aria-label={t("webmcp.pages.list")} className="max-h-52 overflow-y-auto space-y-2 py-2">
          {pages.map((page) => {
            const title = page.title || t("webmcp.pages.draft")
            const identity = `${title} · ${(page.origin ? redactWebMcpText(page.origin) : "") || t("webmcp.pages.blank")} · ${page.project}`
            const accessibleIdentity = `${identity} · ${page.sessionID || t("webmcp.pages.draft")}`
            return (
              <li
                key={page.key}
                data-webmcp-page={page.key}
                data-webmcp-session={page.sessionID}
                className="flex flex-wrap items-center gap-2"
              >
                <button
                  type="button"
                  className={`${buttonClass} min-w-0 flex-1 text-left break-all`}
                  aria-current={selectedKey === page.key ? "page" : undefined}
                  aria-label={`${t("webmcp.pages.showNamed", { page: accessibleIdentity })} · ${t(`webmcp.pages.access.${pageAccess(page)}`)}${page.unloaded ? ` · ${t("webmcp.pages.unloaded")}` : ""}`}
                  onClick={() => showWebMcpPage(page)}
                >
                  {identity} · {t(`webmcp.pages.access.${pageAccess(page)}`)}
                  {page.unloaded ? ` · ${t("webmcp.pages.unloaded")}` : ""}
                </button>
                {page.waiting && <span className="text-[var(--status-warning)]">{t("webmcp.pages.waiting")}</span>}
                {page.sessionID && (
                  <button
                    type="button"
                    className={buttonClass}
                    disabled={pending !== null || (!page.enabled && !page.paused && !page.interrupted)}
                    aria-label={t("webmcp.pages.revokeNamed", { page: accessibleIdentity })}
                    onClick={() => void act(page.key, "revokeSession")}
                  >
                    {t("webmcp.pages.revoke")}
                  </button>
                )}
                {page.idle && !page.visible && selectedKey !== page.key && (
                  <button
                    type="button"
                    className={buttonClass}
                    disabled={pending !== null}
                    aria-label={t("webmcp.pages.closeNamed", { page: accessibleIdentity })}
                    onClick={() => void act(page.key, "close")}
                  >
                    {t("webmcp.pages.close")}
                  </button>
                )}
                <WebMcpCancellationStatus calls={cancellations[page.key] ?? []} />
              </li>
            )
          })}
        </ul>
        {failed && <p role="alert">{t("webmcp.pages.failed")}</p>}
      </details>
    </>
  )
}

export function WebMcpTrustSummary({ viewKey }: { viewKey: string }) {
  const { t } = useI18n()
  const page = useWebMcpPages().find((page) => page.key === viewKey)
  if (!page) return null
  return (
    <details className="shrink-0 border-b border-border px-2.5 py-1.5 typography-micro" data-webmcp-trust>
      <summary className="cursor-pointer">
        {t("webmcp.trust.title")}: {(page.origin ? redactWebMcpText(page.origin) : "") || t("webmcp.pages.blank")} · {page.title || t("webmcp.pages.draft")} ·{" "}
        {t(`webmcp.pages.access.${pageAccess(page)}`)}
      </summary>
      <p className="py-1 break-all">
        {page.project} · {page.sessionID || t("webmcp.pages.draft")}
      </p>
      <p>{t("webmcp.trust.scope")}</p>
      <p>{t("webmcp.trust.controls")}</p>
    </details>
  )
}

export function WebMcpSessionPage({ directory, sessionID }: { directory: string | null; sessionID: string }) {
  const { t } = useI18n()
  const key = viewKeyFor(directory ?? "", sessionID)
  const page = useWebMcpBrowserStore((state) => state.views[key])
  if (!page?.browserId) return null
  return (
    <button
      type="button"
      className={buttonClass}
      data-webmcp-session-page={sessionID}
      onDoubleClick={(event) => event.stopPropagation()}
      onClick={(event) => {
        event.stopPropagation()
        showWebMcpPage(page)
      }}
    >
      {(page.origin ? redactWebMcpText(page.origin) : "") || t("webmcp.pages.blank")} · {t(`webmcp.pages.access.${pageAccess(page)}`)} ·{" "}
      {t("webmcp.pages.show")}
    </button>
  )
}

export function WebMcpWaitingPages() {
  const { t } = useI18n()
  const pages = useWebMcpPages().filter((page) => page.waiting && !page.visible)
  if (!pages.length) return null
  return (
    <section aria-label={t("webmcp.pages.waiting")} className="space-y-2 p-2" data-webmcp-waiting>
      {pages.map((page) => (
        <div key={page.key} className="typography-meta">
          <p>
            {page.project} · {page.title || t("webmcp.pages.draft")}
          </p>
          <p className="text-[var(--status-warning)]">{t("webmcp.browser.waitingForPage")}</p>
          <WebMcpSessionPage directory={page.directory} sessionID={page.sessionID!} />
        </div>
      ))}
    </section>
  )
}
