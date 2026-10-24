import React from "react"
import { Dialog } from "@base-ui/react/dialog"
import { cn } from "@/lib/utils"
import { useI18n } from "@/lib/i18n"
import { useCancelTransientMenuFocusOut, MenuDialogTimingContext, useMenuDialogCommit } from "@/lib/menuDialogFocus"
import type { MenuDialogRequest } from "@/lib/menuDialogRequest"
import { SettingsView } from "./SettingsView"

interface SettingsWindowProps {
  open: boolean
  menuRequest?: MenuDialogRequest
  onOpenChange: (open: boolean) => void
}

const SettingsDialogCommit = () => {
  useMenuDialogCommit()
  return null
}

/**
 * Settings rendered as a centered window with blurred backdrop.
 * Used for desktop and web (non-mobile) environments.
 */
export const SettingsWindow: React.FC<SettingsWindowProps> = ({ open, onOpenChange, menuRequest }) => {
  const { t } = useI18n()
  const descriptionId = React.useId()
  const timing = React.useMemo(() => ({ open, request: menuRequest }), [open, menuRequest])

  const hasOpenFloatingMenu = React.useCallback(() => {
    if (typeof document === "undefined") {
      return false
    }

    return Boolean(
      document.querySelector('[data-slot="dropdown-menu-content"][data-open], [data-slot="select-content"][data-open]'),
    )
  }, [])

  const handleOpenChange = useCancelTransientMenuFocusOut(
    open,
    (next, details) => {
      if (!next && hasOpenFloatingMenu()) {
        details.cancel()
        return
      }
      onOpenChange(next)
    },
    menuRequest,
  )

  return (
    <MenuDialogTimingContext.Provider value={timing}>
      <Dialog.Root open={open} onOpenChange={handleOpenChange}>
        <Dialog.Portal>
          <Dialog.Backdrop
            className={cn(
              "fixed inset-0 z-50 bg-black/50 dark:bg-black/75",
              "transition-opacity duration-150 ease-out",
              "data-[starting-style]:opacity-0 data-[ending-style]:opacity-0",
            )}
          />
          <div className="fixed inset-0 z-50 flex items-center justify-center pointer-events-none">
            <Dialog.Popup
              aria-describedby={descriptionId}
              className={cn(
                "relative pointer-events-auto",
                "w-[90vw] max-w-[1200px] h-[85vh] max-h-[900px]",
                "rounded-xl border shadow-none overflow-hidden origin-center",
                "bg-background",
                "transition-all duration-150 ease-out",
                "data-[starting-style]:opacity-0 data-[starting-style]:scale-[0.98]",
                "data-[ending-style]:opacity-0 data-[ending-style]:scale-[0.98]",
              )}
            >
              <SettingsDialogCommit />
              <Dialog.Description id={descriptionId} className="sr-only">
                {t("settings.window.description")}
              </Dialog.Description>
              <SettingsView onClose={() => onOpenChange(false)} isWindowed />
            </Dialog.Popup>
          </div>
        </Dialog.Portal>
      </Dialog.Root>
    </MenuDialogTimingContext.Provider>
  )
}
