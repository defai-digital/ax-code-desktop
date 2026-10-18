import type { Root } from "mdast"
import type { MarkdownStreamBlock } from "./markdownStreamBlocks"

export type ParsedMarkdownBlock = MarkdownStreamBlock & { tree?: Root; plain?: boolean }
export type MarkdownParseRequest = {
  id: number
  text: string
  live: boolean
  baseKey: string
  ownerId?: number
  baseRevision?: number
}
export type MarkdownParseResponse = {
  id: number
  blocks: ParsedMarkdownBlock[] | null
  baseRevision?: number
  stablePrefixCount?: number
}

export const LARGE_MARKDOWN_THRESHOLD = 16_384
export const MAX_WORKER_MARKDOWN_CHARACTERS = 1_000_000
