import { useCallback, useEffect, useRef, useState } from "react"
import { copyTextToClipboard } from "@/lib/clipboard"
import { clearReplaceableTimeout, resetReplaceableTimeout } from "@/lib/replaceableTimeout"
import { getInstallCommand } from "./installCommands"
import type { OnboardingPlatform } from "./types"

const FEEDBACK_RESET_DELAY_MS = 2000

export const useInstallCommandCopy = (platform: OnboardingPlatform) => {
  const [copied, setCopied] = useState(false)
  const resetTimer = useRef<number | null>(null)
  const mounted = useRef(false)
  useEffect(() => {
    mounted.current = true
    return () => {
      mounted.current = false
      resetTimer.current = clearReplaceableTimeout(resetTimer.current)
    }
  }, [])
  const handleCopy = useCallback(async () => {
    const result = await copyTextToClipboard(getInstallCommand(platform))
    // Clipboard access may finish after leaving onboarding; the old screen no longer owns feedback.
    if (!mounted.current) return
    if (!result.ok) {
      console.error("Failed to copy:", result.error)
      return
    }
    setCopied(true)
    resetTimer.current = resetReplaceableTimeout(
      resetTimer.current,
      () => {
        setCopied(false)
        resetTimer.current = null
      },
      FEEDBACK_RESET_DELAY_MS,
    )
  }, [platform])
  return { copied, handleCopy }
}
