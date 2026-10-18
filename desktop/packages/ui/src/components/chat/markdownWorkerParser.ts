import { unified } from "unified"
import remarkParse from "remark-parse"
import remarkGfm from "remark-gfm"
import remarkMath from "remark-math"
import type { Root } from "mdast"
import { buildFullMarkdownBlock, buildLiveMarkdownBlocks, type LiveMarkdownLexCache } from "./markdownStreamBlocks"
import type { MarkdownParseRequest, MarkdownParseResponse, ParsedMarkdownBlock } from "./markdownWorkerProtocol"

const parser = unified().use(remarkParse).use(remarkGfm).use(remarkMath)

const parseSyntax = (source: string): Root => parser.parse(source) as Root

export const createMarkdownWorkerParser = (parse = parseSyntax) => {
  // Retain only the last successful live request. Message changes, rewrites and
  // finalization invalidate reuse; terminating the worker releases this cache.
  let previous: { text: string; baseKey: string; lex: LiveMarkdownLexCache; blocks: ParsedMarkdownBlock[] } | null =
    null
  return (request: MarkdownParseRequest): ParsedMarkdownBlock[] => {
    const reusable = request.live && previous?.baseKey === request.baseKey && request.text.startsWith(previous.text)
    const oldBlocks = reusable ? previous!.blocks : []
    const projected = request.live
      ? buildLiveMarkdownBlocks(request.text, request.baseKey, reusable ? previous!.lex : null)
      : null
    const blocks = projected?.blocks ?? [buildFullMarkdownBlock(request.text, request.baseKey)]
    const parsed = blocks.map((block, index) => {
      const old = oldBlocks[index]
      if (
        block.mode === "full" &&
        old?.mode === "full" &&
        block.key === old.key &&
        block.raw === old.raw &&
        block.src === old.src
      )
        return old
      // Detach completed substrings from prior request buffers. V8 sliced
      // strings can otherwise retain many whole streaming snapshots. Copy UTF-16
      // units directly so unfinished surrogate pairs are preserved as well.
      const raw = block.mode === "full" ? block.raw.split("").join("") : block.raw
      const src = block.mode === "full" ? (block.src === block.raw ? raw : block.src.split("").join("")) : block.src
      return { ...block, raw, src, tree: parse(src) }
    })
    const stable = projected ? parsed.slice(0, projected.cache.stableBlocks.length) : []
    if (projected) projected.cache.stableBlocks = stable
    // The live tail is always parsed again; retaining its old AST would only
    // increase peak memory during the next parse.
    previous = projected ? { text: request.text, baseKey: request.baseKey, lex: projected.cache, blocks: stable } : null
    return parsed
  }
}

// Stateless entry point for parity checks and standalone parsing.
export const parseMarkdownInWorker = (request: MarkdownParseRequest): ParsedMarkdownBlock[] =>
  createMarkdownWorkerParser()(request)

/** Omit unchanged blocks the receiver explicitly acknowledged; send the changed suffix. */
export const createMarkdownWorkerResponder = () => {
  const parse = createMarkdownWorkerParser()
  let previous: { request: MarkdownParseRequest; blocks: ParsedMarkdownBlock[] } | null = null
  return (request: MarkdownParseRequest): MarkdownParseResponse => {
    const blocks = parse(request)
    let stablePrefixCount = 0
    if (
      request.live &&
      previous &&
      request.ownerId !== undefined &&
      request.ownerId === previous.request.ownerId &&
      request.baseKey === previous.request.baseKey &&
      request.baseRevision === previous.request.id
    ) {
      // The parser reuses references only for semantically stable blocks. A
      // reference definition, rewrite, or final parse invalidates that reuse.
      while (
        stablePrefixCount < blocks.length &&
        blocks[stablePrefixCount].mode === "full" &&
        blocks[stablePrefixCount] === previous.blocks[stablePrefixCount]
      )
        stablePrefixCount++
    }
    const response: MarkdownParseResponse = {
      id: request.id,
      blocks: stablePrefixCount ? blocks.slice(stablePrefixCount) : blocks,
      ...(stablePrefixCount ? { stablePrefixCount, baseRevision: previous!.request.id } : {}),
    }
    // One bounded response, shared with the parser, never a transcript cache.
    previous = request.live ? { request, blocks } : null
    return response
  }
}
