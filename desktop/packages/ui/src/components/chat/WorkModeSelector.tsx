import React from "react"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuLabel,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { Icon } from "@/components/icon/Icon"
import type { IconName } from "@/components/icon/icons"
import { cn } from "@/lib/utils"
import { useDirectoryStore } from "@/stores/useDirectoryStore"
import { useWorkModeStore } from "@/stores/useWorkModeStore"
import { normalizeDirectoryKey } from "@/stores/utils/directoryKey"
import { parseWorkMode, type WorkModeId } from "@/lib/workMode"
import { selectLabeledWorkMode, WORK_MODE_CHOICES } from "@/lib/composerControls"
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip"

const MODE_ICONS: Record<WorkModeId, IconName> = {
  agent: "robot",
  council: "scales-3",
  arena: "sparkling",
}

/**
 * The chip always shows the active mode in its color, matching the TUI (Agent green, Council blue,
 * Arena purple). A gray chip read as "off", so the color is the on state.
 */
const WORK_MODE_TONES: Record<WorkModeId, string> = {
  agent:
    "bg-emerald-500/15 text-emerald-700 border border-emerald-500/35 hover:bg-emerald-500/25 hover:text-emerald-700 dark:text-emerald-300 dark:border-emerald-400/40 dark:hover:text-emerald-300",
  council:
    "bg-blue-500/15 text-blue-700 border border-blue-500/35 hover:bg-blue-500/25 hover:text-blue-700 dark:text-blue-300 dark:border-blue-400/40 dark:hover:text-blue-300",
  arena:
    "bg-purple-500/15 text-purple-700 border border-purple-500/35 hover:bg-purple-500/25 hover:text-purple-700 dark:text-purple-300 dark:border-purple-400/40 dark:hover:text-purple-300",
}

interface WorkModeSelectorProps {
  className?: string
  iconSizeClass?: string
}

/**
 * Labeled work-mode menu. Choosing Agent, Council, or Arena is explicit.
 * A click does not cycle between them.
 */
export const WorkModeSelector: React.FC<WorkModeSelectorProps> = ({
  className,
  iconSizeClass = "h-[18px] w-[18px]",
}) => {
  const currentDirectory = useDirectoryStore((s) => s.currentDirectory)
  const dirKey = normalizeDirectoryKey(currentDirectory)
  const mode = useWorkModeStore((s) => parseWorkMode(s.modeByDirectory[dirKey]))
  const setMode = useWorkModeStore((s) => s.setMode)
  const active = WORK_MODE_CHOICES.find((choice) => choice.id === mode) ?? WORK_MODE_CHOICES[0]!
  const tooltipLabel = `Work mode: ${active.label}`

  return (
    <DropdownMenu>
      <Tooltip delayDuration={350}>
        <TooltipTrigger asChild>
          <DropdownMenuTrigger asChild>
            <button
              type="button"
              aria-label={tooltipLabel}
              title={tooltipLabel}
              className={cn(
                "inline-flex h-7 flex-shrink-0 items-center gap-1 rounded-md px-1.5 typography-micro font-semibold transition-colors",
                "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--interactive-focus-ring)]",
                WORK_MODE_TONES[active.id],
                className,
              )}
            >
              <Icon name={MODE_ICONS[active.id]} className={iconSizeClass} />
              <span className="hidden max-w-[5rem] truncate sm:inline">{active.label}</span>
            </button>
          </DropdownMenuTrigger>
        </TooltipTrigger>
        <TooltipContent side="top" className="max-w-[16rem] typography-micro">
          <p className="font-medium">{active.label}</p>
          <p className="text-muted-foreground">{active.hint}</p>
        </TooltipContent>
      </Tooltip>
      <DropdownMenuContent align="start" className="min-w-[240px]">
        <DropdownMenuLabel className="typography-meta text-muted-foreground">Work mode</DropdownMenuLabel>
        <DropdownMenuRadioGroup
          value={active.id}
          onValueChange={(value) => {
            setMode(currentDirectory, selectLabeledWorkMode(value as WorkModeId))
          }}
        >
          {WORK_MODE_CHOICES.map((choice) => (
            <DropdownMenuRadioItem key={choice.id} value={choice.id} className="items-start gap-2">
              <Icon name={MODE_ICONS[choice.id]} className="mt-0.5 h-4 w-4 flex-shrink-0" />
              <span className="flex min-w-0 flex-col">
                <span className="typography-meta text-foreground">{choice.label}</span>
                <span className="typography-micro text-muted-foreground">{choice.hint}</span>
              </span>
            </DropdownMenuRadioItem>
          ))}
        </DropdownMenuRadioGroup>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
