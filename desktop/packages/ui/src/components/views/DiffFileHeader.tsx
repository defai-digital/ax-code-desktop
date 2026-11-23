import React from "react"

import { DiffViewToggle } from "@/components/chat/message/DiffViewToggle"
import type { DiffViewMode } from "@/components/chat/message/types"
import { Icon } from "@/components/icon/Icon"
import { FileTypeIcon } from "@/components/icons/FileTypeIcon"
import { Button } from "@/components/ui/button"
import { useI18n } from "@/lib/i18n"
import { cn } from "@/lib/utils"
import type { GitChangeDescriptor } from "./git/changeDescriptors"

export interface DiffFileHeaderProps {
  path: string
  descriptor: GitChangeDescriptor
  /** The +/- counts, already formatted; null when there are none. */
  totals: React.ReactNode
  isExpanded: boolean
  isSelected: boolean
  onToggle: () => void
  /** Shown only when the file can be opened in the editor. */
  onOpenInEditor?: () => void
  isOpeningInEditor?: boolean
  layoutMode: DiffViewMode
  onLayoutChange: (mode: DiffViewMode) => void
}

function DiffFilePath(props: { path: string }): React.ReactNode {
  const { path } = props
  const lastSlash = path.lastIndexOf("/")
  if (lastSlash === -1) {
    return (
      <span
        className="block min-w-0 truncate typography-ui-label text-foreground"
        style={{ direction: "rtl", textAlign: "left", unicodeBidi: "plaintext" }}
      >
        {path}
      </span>
    )
  }
  return (
    <span className="flex min-w-0 items-baseline overflow-hidden">
      <span
        className="min-w-0 truncate typography-ui-label text-muted-foreground"
        style={{ direction: "rtl", textAlign: "left", unicodeBidi: "plaintext" }}
      >
        {path.slice(0, lastSlash)}
      </span>
      <span className="flex-shrink-0 typography-ui-label">
        <span className="text-muted-foreground">/</span>
        <span className="text-foreground">{path.slice(lastSlash + 1)}</span>
      </span>
    </span>
  )
}

/**
 * The sticky header of one file in the stacked diff. It is a div holding sibling buttons: one button expands or
 * collapses the file, and the editor and layout buttons sit beside it. It used to be one button holding the other
 * two; nested buttons are invalid and split keyboard activation and the accessible name (G UX-12).
 */
export function DiffFileHeader(props: DiffFileHeaderProps): React.ReactNode {
  const {
    path,
    descriptor,
    totals,
    isExpanded,
    isSelected,
    onToggle,
    onOpenInEditor,
    isOpeningInEditor,
    layoutMode,
    onLayoutChange,
  } = props
  const { t } = useI18n()
  const openLabel = t("diffView.actions.openFileInEditorAtChange")

  return (
    <div
      data-diff-file-header
      className={cn(
        "group/header relative flex w-full items-stretch gap-2 pr-3 rounded-t-xl border border-border/60 overflow-hidden",
        "bg-background",
        isExpanded ? "rounded-b-none" : "rounded-b-xl",
        "text-muted-foreground hover:text-foreground",
        isSelected ? "ring-1 ring-inset ring-[var(--interactive-selection)]" : null,
      )}
    >
      <div className="absolute inset-0 pointer-events-none group-hover/header:bg-interactive-hover" />
      <button
        type="button"
        onClick={onToggle}
        aria-expanded={isExpanded}
        data-diff-file-toggle
        // The toggle carries the header's padding, so its hit area reaches the header's edges as the old one did.
        className="relative flex min-w-0 flex-1 items-center gap-2 py-1.5 pl-3 text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-[var(--interactive-focus-ring)]"
      >
        <span className="flex size-5 items-center justify-center opacity-70 group-hover/header:opacity-100">
          <Icon name={isExpanded ? "arrow-down-s" : "arrow-right-s"} className="size-4" />
        </span>
        <span
          className="typography-micro font-semibold leading-none w-4 text-center uppercase"
          style={{ color: descriptor.color }}
          title={t(descriptor.descriptionKey)}
          aria-label={t(descriptor.descriptionKey)}
        >
          {descriptor.code}
        </span>
        <span className="min-w-0 flex-1 overflow-hidden typography-ui-label" title={path} dir="ltr">
          <span className="flex min-w-0 items-center gap-2">
            <FileTypeIcon filePath={path} className="h-3.5 w-3.5 flex-shrink-0 align-middle" />
            <DiffFilePath path={path} />
          </span>
        </span>
        {totals ? <span className="flex shrink-0 items-center">{totals}</span> : null}
      </button>
      <div className="relative flex items-center gap-2">
        {onOpenInEditor ? (
          <Button
            variant="ghost"
            size="sm"
            className="h-5 w-5 p-0 opacity-70 hover:opacity-100"
            title={openLabel}
            aria-label={openLabel}
            onClick={onOpenInEditor}
            disabled={isOpeningInEditor}
            data-diff-file-open
          >
            {isOpeningInEditor ? (
              <Icon name="loader-4" className="size-3.5 animate-spin" />
            ) : (
              <Icon name="edit" className="size-3.5" />
            )}
          </Button>
        ) : null}
        <DiffViewToggle mode={layoutMode} onModeChange={onLayoutChange} className="opacity-70" />
      </div>
    </div>
  )
}
