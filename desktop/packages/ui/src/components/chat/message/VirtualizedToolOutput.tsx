import React from "react"
import { useVirtualizer } from "@tanstack/react-virtual"
import { Icon } from "@/components/icon/Icon"
import { copyTextToClipboard } from "@/lib/clipboard"
import { useI18n } from "@/lib/i18n"

import { downloadToolOutput } from "./toolOutputText"

export const VirtualizedToolOutput = React.memo(function VirtualizedToolOutput({
  text,
  identityKey,
  height = "min(36vh, 360px)",
}: {
  text: string
  identityKey: string
  height?: string
}) {
  "use no memo"
  // TanStack updates ranges on a stable object; compiler caching must not freeze them.
  const { t } = useI18n()
  const scrollRef = React.useRef<HTMLDivElement>(null)
  const lines = React.useMemo(() => text.split(/\r?\n/), [text])
  const getItemKey = React.useCallback((index: number) => `${identityKey}:${index}`, [identityKey])
  const virtualizer = useVirtualizer({
    count: lines.length,
    getScrollElement: () => scrollRef.current,
    getItemKey,
    estimateSize: () => 20,
    initialRect: { width: 0, height: 320 },
    overscan: 6,
    useAnimationFrameWithResizeObserver: true,
  })
  React.useEffect(() => {
    if (scrollRef.current) scrollRef.current.scrollTop = 0
  }, [identityKey])
  const rows = virtualizer.getVirtualItems()

  return (
    <div
      className="tool-output-surface w-full min-w-0 typography-code text-muted-foreground/90"
      data-tool-output="virtualized"
    >
      <div className="flex justify-end gap-1 pb-1">
        <button
          type="button"
          className="p-1 rounded hover:bg-interactive-hover"
          aria-label={t("chat.messageBody.shellCommand.copyOutput")}
          title={t("chat.messageBody.shellCommand.copyOutput")}
          onClick={(event) => {
            event.stopPropagation()
            void copyTextToClipboard(text)
          }}
        >
          <Icon name="file-copy" className="size-3.5" />
        </button>
        <button
          type="button"
          className="p-1 rounded hover:bg-interactive-hover"
          aria-label={t("chat.toolOutput.download")}
          title={t("chat.toolOutput.download")}
          onClick={(event) => {
            event.stopPropagation()
            downloadToolOutput(text)
          }}
        >
          <Icon name="download" className="size-3.5" />
        </button>
      </div>
      <div
        ref={scrollRef}
        role="region"
        aria-label={t("chat.toolPart.output")}
        tabIndex={0}
        className="overflow-auto w-full min-w-0"
        style={{ height, overflowAnchor: "none" }}
      >
        <div style={{ height: virtualizer.getTotalSize(), position: "relative" }}>
          {rows.map((row) => (
            <div
              key={row.key}
              ref={virtualizer.measureElement}
              data-index={row.index}
              data-tool-output-line={row.index + 1}
              className="font-mono whitespace-pre-wrap break-words"
              style={{
                position: "absolute",
                top: 0,
                left: 0,
                width: "100%",
                minHeight: 20,
                lineHeight: "20px",
                overflowWrap: "anywhere",
                transform: `translateY(${row.start}px)`,
              }}
            >
              {lines[row.index]}
            </div>
          ))}
        </div>
      </div>
    </div>
  )
})
