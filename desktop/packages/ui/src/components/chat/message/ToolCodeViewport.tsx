import React from "react"
import { Virtualizer, WorkerPoolContext } from "@pierre/diffs/react"
import { useWorkerPool } from "@/contexts/DiffWorkerProvider"
import { VirtualizedToolOutput } from "./VirtualizedToolOutput"
import { Icon } from "@/components/icon/Icon"
import { copyTextToClipboard } from "@/lib/clipboard"
import { useI18n } from "@/lib/i18n"
import { downloadToolOutput, shouldVirtualizeToolOutput } from "./toolOutputText"

/** Supply Pierre's viewport context so File and PatchDiff mount only nearby rows. */
interface ToolCodeViewportProps {
  source: string
  children: React.ReactNode
  diffStyle?: "unified" | "split"
}

export const ToolCodeViewport = ({ source, children, diffStyle = "unified" }: ToolCodeViewportProps) => {
  if (!shouldVirtualizeToolOutput(source)) return <>{children}</>
  // A mode change mounts with the correct pool instead of retaining the previous instance.
  return (
    <LargeToolCodeViewport key={diffStyle} source={source} diffStyle={diffStyle}>
      {children}
    </LargeToolCodeViewport>
  )
}

const LargeToolCodeViewport = ({ source, children, diffStyle = "unified" }: ToolCodeViewportProps) => {
  const { t } = useI18n()
  const pool = useWorkerPool(diffStyle)
  // Mount Pierre only after a pool is available: its instance captures the pool on mount.
  if (!pool) return <VirtualizedToolOutput text={source} identityKey="code-output" height="60vh" />

  // A zero-height loading host makes Pierre anchor its bottom when syntax arrives.
  return (
    <div
      data-tool-code-viewport
      role="region"
      aria-label={t("chat.toolPart.output")}
      className="[&_diffs-container]:min-h-px"
    >
      <div className="flex justify-end gap-1 py-1">
        <button
          type="button"
          className="p-1 rounded hover:bg-interactive-hover"
          aria-label={t("chat.messageBody.shellCommand.copyOutput")}
          title={t("chat.messageBody.shellCommand.copyOutput")}
          onClick={() => void copyTextToClipboard(source)}
        >
          <Icon name="file-copy" className="size-3.5" />
        </button>
        <button
          type="button"
          className="p-1 rounded hover:bg-interactive-hover"
          aria-label={t("chat.toolOutput.download")}
          title={t("chat.toolOutput.download")}
          onClick={() => downloadToolOutput(source)}
        >
          <Icon name="download" className="size-3.5" />
        </button>
      </div>
      <WorkerPoolContext.Provider value={pool}>
        <Virtualizer
          config={{ overscrollSize: 400 }}
          style={{ height: "60vh", overflow: "auto", overflowAnchor: "none" }}
        >
          {children}
        </Virtualizer>
      </WorkerPoolContext.Provider>
    </div>
  )
}
