import React from "react"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { Icon } from "@/components/icon/Icon"
import { cn } from "@/lib/utils"
import { useI18n } from "@/lib/i18n"
import { useDirectoryStore } from "@/stores/useDirectoryStore"
import { useExecutionModeStore } from "@/stores/useExecutionModeStore"
import { normalizeDirectoryKey } from "@/stores/utils/directoryKey"
import { OVERFLOW_SEND_CONTROLS } from "@/lib/composerControls"
import { WebMcpComposerChip } from "./WebMcpComposerChip"
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip"

interface ComposerOverflowMenuProps {
  className?: string
  iconSizeClass?: string
}

/**
 * Long-run and WebMCP stay reachable here, off the primary send row.
 */
export const ComposerOverflowMenu: React.FC<ComposerOverflowMenuProps> = ({
  className,
  iconSizeClass = "h-[18px] w-[18px]",
}) => {
  const { t } = useI18n()
  const currentDirectory = useDirectoryStore((s) => s.currentDirectory)
  const dirKey = normalizeDirectoryKey(currentDirectory)
  const mode = useExecutionModeStore((s) => s.modeByDirectory[dirKey])
  const pending = useExecutionModeStore((s) => s.pendingByDirectory[dirKey] === true)
  const setMode = useExecutionModeStore((s) => s.setMode)
  const loadMode = useExecutionModeStore((s) => s.loadMode)
  const longRunActive = mode === "long-run"
  const label = t("chat.chatInput.overflow.more")

  React.useEffect(() => {
    void loadMode(currentDirectory)
  }, [currentDirectory, loadMode])

  return (
    <DropdownMenu>
      <Tooltip delayDuration={400}>
        <TooltipTrigger asChild>
          <DropdownMenuTrigger asChild>
            <button
              type="button"
              aria-label={label}
              title={label}
              data-overflow-controls={OVERFLOW_SEND_CONTROLS.join(",")}
              className={cn(
                "flex h-7 w-7 flex-shrink-0 cursor-pointer items-center justify-center rounded-md text-muted-foreground outline-none transition-colors",
                "hover:bg-interactive-hover hover:text-foreground",
                "focus-visible:ring-2 focus-visible:ring-[var(--interactive-focus-ring)]",
                "data-[state=open]:bg-interactive-selection data-[state=open]:text-foreground",
                longRunActive && "text-foreground",
                className,
              )}
            >
              <Icon name="more-2" className={cn(iconSizeClass, "flex-shrink-0")} />
            </button>
          </DropdownMenuTrigger>
        </TooltipTrigger>
        <TooltipContent side="top" sideOffset={8}>
          {label}
        </TooltipContent>
      </Tooltip>
      <DropdownMenuContent align="start" className="min-w-[220px]">
        <DropdownMenuLabel className="typography-meta text-muted-foreground">{label}</DropdownMenuLabel>
        <DropdownMenuItem
          disabled={pending}
          onClick={() => {
            if (pending) return
            void setMode(currentDirectory, longRunActive ? "autonomous" : "long-run")
          }}
        >
          <Icon name="timer" className="mr-2 h-4 w-4" />
          <span className="flex min-w-0 flex-col">
            <span>{t("chat.chatInput.executionMode.longRun")}</span>
            <span className="typography-micro text-muted-foreground">
              {t("chat.chatInput.executionMode.longRunHint")}
            </span>
          </span>
          {longRunActive ? <Icon name="check" className="ml-auto h-3.5 w-3.5" /> : null}
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        <div className="px-1 py-1">
          <WebMcpComposerChip iconSizeClass={iconSizeClass} />
        </div>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
