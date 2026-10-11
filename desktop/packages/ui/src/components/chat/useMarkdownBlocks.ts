import React from "react"
import { buildFullMarkdownBlock, buildLiveMarkdownBlocks, type LiveMarkdownLexCache } from "./markdownStreamBlocks"
import { markdownWorkerClient } from "./markdownWorkerClient"
import { LARGE_MARKDOWN_THRESHOLD, type ParsedMarkdownBlock } from "./markdownWorkerProtocol"

type WorkerResult = { baseKey: string; text: string; live: boolean; revision: number; blocks: ParsedMarkdownBlock[] }

export const useStableMarkdownBlocks = (text: string, live: boolean, baseKey: string): ParsedMarkdownBlock[] => {
  const previousRef = React.useRef<ParsedMarkdownBlock[]>([])
  const lexCacheRef = React.useRef<LiveMarkdownLexCache | null>(null)
  const owner = React.useMemo(() => ({}), [])
  const revisionRef = React.useRef(0)
  const [result, setResult] = React.useState<WorkerResult | null>(null)
  const useWorker = text.length >= LARGE_MARKDOWN_THRESHOLD
  const currentRef = React.useRef({ baseKey, text, live, useWorker, mounted: false })
  currentRef.current = { baseKey, text, live, useWorker, mounted: currentRef.current.mounted }

  React.useEffect(() => {
    currentRef.current.mounted = true
    return () => {
      currentRef.current.mounted = false
      markdownWorkerClient.release(owner)
    }
  }, [owner])

  React.useEffect(() => {
    if (!useWorker) {
      markdownWorkerClient.release(owner)
      setResult(null)
      return
    }
    const revision = ++revisionRef.current
    markdownWorkerClient.request(owner, { text, live, baseKey }, (blocks) => {
      const current = currentRef.current
      if (
        !current.mounted ||
        !current.useWorker ||
        current.baseKey !== baseKey ||
        current.live !== live ||
        (live ? !current.text.startsWith(text) : current.text !== text)
      )
        return
      setResult((previous) => {
        if (previous?.baseKey === baseKey && previous.live === live && previous.revision > revision) return previous
        return {
          baseKey,
          text,
          live,
          revision,
          blocks: blocks ?? [{ ...buildFullMarkdownBlock(text, baseKey), plain: true }],
        }
      })
    })
  }, [baseKey, live, owner, text, useWorker])

  return React.useMemo(() => {
    let nextBlocks: ParsedMarkdownBlock[]
    if (useWorker) {
      lexCacheRef.current = null
      const reusable =
        result?.baseKey === baseKey &&
        result.live === live &&
        (live ? text.startsWith(result.text) : result.text === text)
      // Always expose the complete source while waiting for the first parse.
      // Do not synchronously parse large bodies on failure or without workers.
      nextBlocks = reusable ? result.blocks : [{ ...buildFullMarkdownBlock(text, baseKey), plain: true }]
    } else if (live) {
      const projected = buildLiveMarkdownBlocks(text, baseKey, lexCacheRef.current)
      lexCacheRef.current = projected.cache
      nextBlocks = projected.blocks
    } else {
      lexCacheRef.current = null
      nextBlocks = [buildFullMarkdownBlock(text, baseKey)]
    }
    const previousBlocks = previousRef.current
    const stabilized = nextBlocks.map((block, index) => {
      const previous = previousBlocks[index]
      if (
        previous &&
        previous.key === block.key &&
        previous.src === block.src &&
        previous.plain === block.plain &&
        previous.tree === block.tree
      )
        return previous
      return block
    })
    if (
      stabilized.length === previousBlocks.length &&
      stabilized.every((block, index) => block === previousBlocks[index])
    ) {
      return previousBlocks
    }
    previousRef.current = stabilized
    return stabilized
  }, [baseKey, live, result, text, useWorker])
}
