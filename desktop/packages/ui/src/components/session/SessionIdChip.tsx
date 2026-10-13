import React from "react"
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip"
import { Icon } from "@/components/icon/Icon"
import { copySessionId, shortSessionId } from "@/lib/sessionId"
import { useI18n } from "@/lib/i18n"
import { cn } from "@/lib/utils"

type SessionIdChipProps = {
  sessionId: string
  className?: string
}

/** Click-to-copy session id so a problem session can be named in a report or resumed with `--session`. */
export const SessionIdChip = React.memo(function SessionIdChip({ sessionId, className }: SessionIdChipProps) {
  const { t } = useI18n()
  const handleClick = React.useCallback(() => {
    void copySessionId(sessionId, t)
  }, [sessionId, t])

  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <button
          type="button"
          onClick={handleClick}
          aria-label={t("sessions.id.copyAria", { id: sessionId })}
          className={cn(
            "app-region-no-drag inline-flex min-w-0 max-w-[10rem] items-center gap-1 rounded-md px-1.5 py-0.5 font-mono typography-micro leading-tight text-muted-foreground transition-colors hover:bg-interactive-hover/60 hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--interactive-focus-ring)]",
            className,
          )}
        >
          <span className="truncate">{shortSessionId(sessionId)}</span>
          <Icon name="file-copy" className="h-3 w-3 flex-shrink-0" />
        </button>
      </TooltipTrigger>
      <TooltipContent>
        <p className="font-mono">{sessionId}</p>
        <p>{t("sessions.id.copyHint")}</p>
      </TooltipContent>
    </Tooltip>
  )
})
