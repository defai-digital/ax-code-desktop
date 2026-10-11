import { unified } from "unified"
import remarkParse from "remark-parse"
import remarkGfm from "remark-gfm"
import remarkMath from "remark-math"
import type { Root } from "mdast"
import { buildFullMarkdownBlock, buildLiveMarkdownBlocks } from "./markdownStreamBlocks"
import type { MarkdownParseRequest, ParsedMarkdownBlock } from "./markdownWorkerProtocol"

const parser = unified().use(remarkParse).use(remarkGfm).use(remarkMath)

export const parseMarkdownInWorker = (request: MarkdownParseRequest): ParsedMarkdownBlock[] => {
  const blocks = request.live
    ? buildLiveMarkdownBlocks(request.text, request.baseKey).blocks
    : [buildFullMarkdownBlock(request.text, request.baseKey)]
  return blocks.map((block) => ({ ...block, tree: parser.parse(block.src) as Root }))
}
