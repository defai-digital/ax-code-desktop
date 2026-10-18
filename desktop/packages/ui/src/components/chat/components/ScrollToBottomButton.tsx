import React from "react"

import { Button } from "@/components/ui/button"
import { Icon } from "@/components/icon/Icon"
import { cn } from "@/lib/utils"
import { useI18n } from "@/lib/i18n"

interface ScrollToBottomButtonProps {
  visible: boolean
  onClick: () => void
  unseenCount?: number
}

const ScrollToBottomButton: React.FC<ScrollToBottomButtonProps> = ({ visible, onClick, unseenCount = 0 }) => {
  const { t } = useI18n()
  const hasUnseen = unseenCount > 0
  return (
    <div
      // Hidden with opacity only (for the transition), so it must leave the tab order and
      // the accessibility tree too: keyboard users could Tab to an invisible control.
      aria-hidden={!visible}
      className={cn(
        "absolute bottom-full left-1/2 z-40 -translate-x-1/2 mb-2 transition-all duration-150",
        visible
          ? "opacity-100 translate-y-0 scale-100 pointer-events-auto"
          : "opacity-0 translate-y-2 scale-95 pointer-events-none",
      )}
    >
      <Button
        variant="outline"
        size="sm"
        onClick={onClick}
        className={cn(
          "rounded-full [corner-shape:round]! p-0 shadow-none bg-background/95 hover:bg-interactive-hover",
          hasUnseen ? "h-7 gap-1 px-2.5" : "size-8",
        )}
        aria-label={t("chat.scrollToBottom.aria")}
        tabIndex={visible ? undefined : -1}
      >
        <Icon name="arrow-down" className="h-4 w-4 shrink-0" />
        {hasUnseen && (
          <span className="typography-micro tabular-nums font-medium text-muted-foreground">
            {t("chat.scrollToBottom.newMessages", { count: unseenCount })}
          </span>
        )}
      </Button>
    </div>
  )
}

export default React.memo(ScrollToBottomButton)
