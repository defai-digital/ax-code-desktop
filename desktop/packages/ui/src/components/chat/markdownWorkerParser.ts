import { unified } from "unified"
import remarkParse from "remark-parse"
import remarkGfm from "remark-gfm"
import remarkMath from "remark-math"
import type { Root } from "mdast"
import { buildFullMarkdownBlock, buildLiveMarkdownBlocks, type LiveMarkdownLexCache } from "./markdownStreamBlocks"
import type { MarkdownParseRequest, ParsedMarkdownBlock } from "./markdownWorkerProtocol"

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
