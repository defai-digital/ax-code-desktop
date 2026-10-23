import React from "react"

import { importWithChunkRecovery } from "@/lib/chunkLoadRecovery"
import type { HighlightRange } from "./composerHighlight"

export type FencedCodeHighlighter = (text: string) => HighlightRange[]

const noFencedCodeHighlight: FencedCodeHighlighter = () => []

/** Whether the draft contains an opening fence. The loader effect keys off this, not the draft text. */
export const draftContainsFence = (message: string): boolean => message.includes("```") || message.includes("~~~")

/**
 * Loads the fenced-code highlighter once a draft contains a fence.
 * Further keystrokes inside that fence must not re-enter the loader.
 */
export function useFencedCodeHighlighter(message: string, inputMode: string): FencedCodeHighlighter {
  const [fencedCodeHighlighter, setFencedCodeHighlighter] = React.useState<FencedCodeHighlighter>(
    () => noFencedCodeHighlight,
  )
  const fenced = draftContainsFence(message)
  const [failedMessage, setFailedMessage] = React.useState<string | null>(null)
  const loadedRef = React.useRef(false)
  const messageRef = React.useRef(message)
  React.useEffect(() => {
    messageRef.current = message
  })
  // After a failed load, a keystroke that changes the draft retries it. Settling (success or the failure
  // itself) does not change this key, so the effect does not re-enter the loader on its own.
  const retryKey = failedMessage !== null && failedMessage !== message ? message : null

  React.useEffect(() => {
    if (inputMode === "shell" || !fenced || loadedRef.current) {
      return
    }

    let cancelled = false
    void importWithChunkRecovery(() => import("./composerCodeHighlight"))
      .then((module) => {
        if (!cancelled) {
          loadedRef.current = true
          setFencedCodeHighlighter(() => module.highlightFencedCode)
        }
      })
      .catch((error) => {
        console.warn("[ChatInput] Failed to load fenced code highlighter:", error)
        if (!cancelled) setFailedMessage(messageRef.current)
      })

    return () => {
      cancelled = true
    }
  }, [inputMode, fenced, retryKey])

  return fencedCodeHighlighter
}
