import React from "react"
import { useI18n } from "@/lib/i18n"
import { copyTextToClipboard } from "@/lib/clipboard"
import type { Theme } from "@/types/theme"
import { renderMermaidDiagram } from "./mermaidRenderer"
import { MermaidRenderError, type MermaidErrorCode, type MermaidMode, type MermaidRequest } from "./mermaidProtocol"
import { downloadMermaidBlob, mermaidSvgToPng } from "./mermaidExport"

type RenderState = {
  request: MermaidRequest
  attempt: number
  output?: string
  error?: MermaidErrorCode
  detail?: string
}

export function MermaidBlock({
  source,
  mode,
  theme,
  deferRender = false,
}: {
  source: string
  mode: MermaidMode
  theme: Theme
  deferRender?: boolean
}) {
  const { t } = useI18n()
  const [showSource, setShowSource] = React.useState(false)
  const [attempt, setAttempt] = React.useState(0)
  const [state, setState] = React.useState<RenderState | null>(null)
  const [action, setAction] = React.useState<"idle" | "exporting" | "copied" | "failed">("idle")
  const actionGeneration = React.useRef({ value: 0 })
  const request = React.useMemo<MermaidRequest>(
    () => ({
      source,
      mode,
      dark: theme.metadata.variant === "dark",
      colors: {
        bg: theme.colors.surface.elevated,
        fg: theme.colors.surface.foreground,
        line: theme.colors.interactive.border,
        accent: theme.colors.primary.base,
        muted: theme.colors.surface.mutedForeground,
        surface: theme.colors.surface.muted,
        border: theme.colors.interactive.border,
        transparent: true,
        font: "Inter, sans-serif",
      },
    }),
    [source, mode, theme],
  )

  React.useEffect(() => {
    if (deferRender) return
    const controller = new AbortController()
    renderMermaidDiagram(request, controller.signal).then(
      (output) => {
        if (!controller.signal.aborted) setState({ request, attempt, output })
      },
      (error) => {
        if (controller.signal.aborted) return
        const code = error instanceof MermaidRenderError ? error.code : "unavailable"
        setState({
          request,
          attempt,
          error: code,
          detail: code === "render" && error instanceof Error ? error.message.slice(0, 500) : undefined,
        })
      },
    )
    return () => controller.abort()
  }, [request, deferRender, attempt])

  React.useEffect(() => {
    const generation = actionGeneration.current
    generation.value++
    setAction("idle")
    return () => {
      generation.value++
    }
  }, [request])
  React.useEffect(() => {
    if (action !== "copied" && action !== "failed") return
    const timer = setTimeout(() => setAction("idle"), 3_000)
    return () => clearTimeout(timer)
  }, [action])

  // Never display the previous diagram or enable exports for a new source/theme.
  const current = !deferRender && state?.request === request && state.attempt === attempt ? state : null
  const output = current?.output
  const error = current?.error
  const svg = mode === "svg" ? output : undefined
  const pending = !deferRender && !current
  const runAction = async (operation: () => Promise<void> | void, copying = false) => {
    const generation = actionGeneration.current.value
    setAction("exporting")
    try {
      await operation()
      if (generation === actionGeneration.current.value) setAction(copying ? "copied" : "idle")
    } catch {
      if (generation === actionGeneration.current.value) setAction("failed")
    }
  }
  const copyText = async (text: string) => {
    if (!(await copyTextToClipboard(text)).ok) throw new Error("Clipboard unavailable")
  }
  const busy = action === "exporting"
  const buttonClass = "rounded px-2 py-1 text-xs hover:bg-interactive-hover disabled:opacity-50"

  return (
    <div
      data-markdown="mermaid-block"
      data-mermaid-source={source}
      data-mermaid-theme={theme.metadata.variant}
      aria-busy={pending}
    >
      <div className="mb-2 flex flex-wrap items-center gap-1" data-mermaid-controls>
        <button
          type="button"
          className={buttonClass}
          aria-pressed={showSource}
          onClick={() => setShowSource((value) => !value)}
        >
          {t(
            showSource ? "markdownRenderer.mermaid.actions.showDiagram" : "markdownRenderer.mermaid.actions.showSource",
          )}
        </button>
        <button
          type="button"
          className={buttonClass}
          disabled={busy}
          onClick={() => void runAction(() => copyText(source), true)}
        >
          {t("markdownRenderer.mermaid.actions.copySourceTitle")}
        </button>
        {mode === "ascii" && output && (
          <button
            type="button"
            className={buttonClass}
            disabled={busy}
            onClick={() => void runAction(() => copyText(output), true)}
          >
            {t("markdownRenderer.mermaid.actions.copyAscii")}
          </button>
        )}
        {svg && (
          <>
            <button
              type="button"
              className={buttonClass}
              disabled={busy}
              onClick={() =>
                void runAction(() =>
                  downloadMermaidBlob(new Blob([svg], { type: "image/svg+xml;charset=utf-8" }), "svg"),
                )
              }
            >
              {t("markdownRenderer.mermaid.actions.downloadSvgTitle")}
            </button>
            <button
              type="button"
              className={buttonClass}
              disabled={busy}
              onClick={() =>
                void runAction(async () =>
                  downloadMermaidBlob(await mermaidSvgToPng(svg, theme.colors.surface.elevated), "png"),
                )
              }
            >
              {t("markdownRenderer.mermaid.actions.downloadPng")}
            </button>
            {typeof ClipboardItem !== "undefined" && typeof navigator.clipboard?.write === "function" && (
              <button
                type="button"
                className={buttonClass}
                disabled={busy}
                onClick={() =>
                  void runAction(() => {
                    // Pass the promise immediately so clipboard permission retains the user gesture.
                    return navigator.clipboard.write([
                      new ClipboardItem({ "image/png": mermaidSvgToPng(svg, theme.colors.surface.elevated) }),
                    ])
                  }, true)
                }
              >
                {t("markdownRenderer.mermaid.actions.copyImage")}
              </button>
            )}
          </>
        )}
      </div>
      <div role="status" className="text-xs text-muted-foreground" aria-live="polite">
        {deferRender
          ? t("markdownRenderer.mermaid.status.streaming")
          : pending
            ? t("markdownRenderer.mermaid.status.loading")
            : null}
        {action === "copied"
          ? t("markdownRenderer.mermaid.status.copied")
          : action === "failed"
            ? t("markdownRenderer.mermaid.status.actionFailed")
            : null}
      </div>
      {error && (
        <div role="alert" className="mb-2 text-sm">
          <p>{t(`markdownRenderer.mermaid.error.${error}`)}</p>
          {current?.detail && <pre className="whitespace-pre-wrap text-xs">{current.detail}</pre>}
          {["timeout", "unavailable", "busy"].includes(error) && (
            <button type="button" className={buttonClass} onClick={() => setAttempt((value) => value + 1)}>
              {t("chat.toolOutputDialog.mermaid.retry")}
            </button>
          )}
        </div>
      )}
      <div data-markdown="mermaid-scroll">
        {showSource || !output ? (
          <pre data-markdown="mermaid-ascii">{source}</pre>
        ) : mode === "ascii" ? (
          <pre data-markdown="mermaid-ascii">{output}</pre>
        ) : (
          <div data-markdown="mermaid" dangerouslySetInnerHTML={{ __html: output }} />
        )}
      </div>
    </div>
  )
}
