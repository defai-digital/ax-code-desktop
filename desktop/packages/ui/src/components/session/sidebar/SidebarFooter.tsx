import React from "react"
import { Button } from "@/components/ui/button"
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip"
import { Icon } from "@/components/icon/Icon"
import { ThemeModeToggle } from "@/components/layout/ThemeModeToggle"
import { useI18n } from "@/lib/i18n"
import { cn } from "@/lib/utils"
import { PRODUCT_DISPLAY_NAME } from "@/lib/product"

type Props = {
  onOpenSettings: () => void
  onOpenShortcuts: () => void
  onOpenAbout: () => void
  onOpenUpdate: () => void
  showRuntimeButtons?: boolean
  showUpdateButton?: boolean
}

const footerButtonClassName =
  "inline-flex h-8 w-8 items-center justify-center rounded-md text-muted-foreground hover:bg-interactive-hover/50 hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--interactive-focus-ring)]"

export function SidebarFooter({
  onOpenSettings,
  onOpenShortcuts,
  onOpenAbout,
  onOpenUpdate,
  showRuntimeButtons = true,
  showUpdateButton = true,
}: Props): React.ReactNode {
  const { t } = useI18n()

  return (
    <div className="flex shrink-0 items-center gap-1 px-2.5 py-2">
      {showRuntimeButtons ? (
        <Tooltip>
          <TooltipTrigger asChild>
            <button
              type="button"
              onClick={onOpenAbout}
              data-sidebar-brand
              className={cn(
                "flex h-8 min-w-0 flex-1 items-center gap-2 rounded-md px-1.5 text-foreground",
                "hover:bg-interactive-hover/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--interactive-focus-ring)]",
              )}
              aria-label={t("sessions.sidebar.footer.actions.aboutOpenChamber")}
            >
              <Icon name="ax-mark" className="h-4.5 w-4.5 flex-shrink-0 text-primary" />
              <span className="min-w-0 truncate typography-ui-label font-semibold">{PRODUCT_DISPLAY_NAME}</span>
            </button>
          </TooltipTrigger>
          <TooltipContent side="top" sideOffset={4}>
            <p>{t("sessions.sidebar.footer.actions.aboutOpenChamber")}</p>
          </TooltipContent>
        </Tooltip>
      ) : (
        <div className="flex-1" />
      )}
      {showUpdateButton ? (
        <Button
          type="button"
          variant="default"
          size="xs"
          className="flex-shrink-0 border-[var(--status-info-border)] bg-[var(--status-info-background)] text-[var(--status-info)] hover:bg-[var(--status-info-background)]/80 hover:text-[var(--status-info)] dark:border-[var(--status-info-border)] dark:bg-[var(--status-info-background)] dark:hover:bg-[var(--status-info-background)]/80"
          onClick={onOpenUpdate}
        >
          {t("sessions.sidebar.footer.actions.update")}
        </Button>
      ) : null}
      {showRuntimeButtons ? (
        <div className="flex flex-shrink-0 items-center gap-0.5">
          <ThemeModeToggle buttonClassName={footerButtonClassName} />
          <Tooltip>
            <TooltipTrigger asChild>
              <button
                type="button"
                onClick={onOpenShortcuts}
                className={footerButtonClassName}
                aria-label={t("sessions.sidebar.footer.actions.shortcuts")}
              >
                <Icon name="question" className="h-4.5 w-4.5" />
              </button>
            </TooltipTrigger>
            <TooltipContent side="top" sideOffset={4}>
              <p>{t("sessions.sidebar.footer.actions.shortcuts")}</p>
            </TooltipContent>
          </Tooltip>
          <Tooltip>
            <TooltipTrigger asChild>
              <button
                type="button"
                onClick={onOpenSettings}
                className={footerButtonClassName}
                aria-label={t("sessions.sidebar.footer.actions.settings")}
              >
                <Icon name="settings-3" className="h-4.5 w-4.5" />
              </button>
            </TooltipTrigger>
            <TooltipContent side="top" sideOffset={4}>
              <p>{t("sessions.sidebar.footer.actions.settings")}</p>
            </TooltipContent>
          </Tooltip>
        </div>
      ) : null}
    </div>
  )
}
