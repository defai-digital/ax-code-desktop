import React from "react"
import { countSessionsWithWaitingPages } from "@/lib/webMcpViewKey"
import { useWebMcpPages } from "@/hooks/useWebMcpPages"

import { Icon } from "@/components/icon/Icon"
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip"
import { useSupervisionRows } from "@/hooks/useSupervisionRows"
import { useI18n } from "@/lib/i18n"
import { needsHuman } from "@/lib/supervision/sessionState"
import { cn } from "@/lib/utils"
import { useSupervisionStore } from "@/stores/useSupervisionStore"

import { NeedsYouPopover } from "./NeedsYouPopover"

const quietButtonClass =
  "app-region-no-drag inline-flex h-8 w-8 items-center justify-center rounded-md typography-ui-label font-medium text-muted-foreground transition-colors hover:bg-interactive-hover hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--interactive-focus-ring)]"

/**
 * Titlebar count of sessions that need a person. The popover is the place to act without opening
 * each session. Zero still opens the popover so the empty state and Mission Control stay one click away.
 */
export const NeedsYouButton: React.FC = () => {
  const { t } = useI18n()
  const rows = useSupervisionRows()
  const open = useSupervisionStore((state) => state.needsYouPopoverOpen)
  const setOpen = useSupervisionStore((state) => state.setNeedsYouPopoverOpen)
  const waiting = useWebMcpPages().filter((page) => page.waiting && !page.visible)
  const count = countSessionsWithWaitingPages(
    rows.filter((row) => needsHuman(row.state)),
    waiting,
  )
  const close = React.useCallback(() => setOpen(false), [setOpen])
  const label = count > 0 ? t("supervision.needsYou.openAria", { count }) : t("supervision.needsYou.openEmptyAria")

  return (
    <div className="relative inline-flex">
      <Tooltip>
        <TooltipTrigger asChild>
          <button
            type="button"
            aria-label={label}
            aria-expanded={open}
            aria-haspopup="dialog"
            onClick={() => setOpen(!open)}
            className={cn(
              count > 0
                ? "app-region-no-drag inline-flex h-7 items-center gap-1.5 rounded-full border border-[color-mix(in_srgb,var(--status-warning)_35%,transparent)] bg-[color-mix(in_srgb,var(--status-warning)_12%,transparent)] px-2.5 typography-ui-label text-foreground transition-colors hover:bg-[color-mix(in_srgb,var(--status-warning)_18%,transparent)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--interactive-focus-ring)]"
                : quietButtonClass,
              open && count === 0 && "bg-interactive-hover text-foreground",
            )}
          >
            {count > 0 ? (
              <>
                <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-[var(--status-warning)]" aria-hidden="true" />
                <span>{t("supervision.needsYou.pill", { count })}</span>
              </>
            ) : (
              <Icon name="list-check-2" className="h-[18px] w-[18px]" aria-hidden="true" />
            )}
          </button>
        </TooltipTrigger>
        <TooltipContent>
          <p>{label}</p>
        </TooltipContent>
      </Tooltip>
      {open ? <NeedsYouPopover onClose={close} /> : null}
    </div>
  )
}
