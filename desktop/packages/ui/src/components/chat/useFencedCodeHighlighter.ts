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

  React.useEffect(() => {
    if (inputMode === "shell" || !fenced) {
      return
    }

    let cancelled = false
    void importWithChunkRecovery(() => import("./composerCodeHighlight"))
      .then((module) => {
        if (!cancelled) {
          setFencedCodeHighlighter(() => module.highlightFencedCode)
        }
      })
      .catch((error) => {
        console.warn("[ChatInput] Failed to load fenced code highlighter:", error)
      })

    return () => {
      cancelled = true
    }
  }, [inputMode, fenced])

  return fencedCodeHighlighter
}
