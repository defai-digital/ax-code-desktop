import React from "react"
import ReactMarkdown, { type Components } from "react-markdown"
import remarkGfm from "remark-gfm"
import remarkMath from "remark-math"
import rehypeKatex from "rehype-katex"
import type { Root } from "mdast"
import type { Processor } from "unified"
import type { ParsedMarkdownBlock } from "./markdownWorkerProtocol"

// Install after the syntax extensions: reuse the worker's MDAST while keeping
// ReactMarkdown's existing HAST conversion, URL filtering and custom components.
function remarkPreparsed(this: Processor, tree: Root) {
  this.parser = () => tree
}

export const PreparedMarkdown = React.memo(
  ({ block, components }: { block: ParsedMarkdownBlock; components: Components }) => {
    if (block.plain) return <div className="whitespace-pre-wrap">{block.raw}</div>
    return (
      <ReactMarkdown
        remarkPlugins={block.tree ? [remarkGfm, remarkMath, [remarkPreparsed, block.tree]] : [remarkGfm, remarkMath]}
        rehypePlugins={[[rehypeKatex, { throwOnError: false, errorColor: "var(--destructive)" }]]}
        components={components}
      >
        {block.src}
      </ReactMarkdown>
    )
  },
)
PreparedMarkdown.displayName = "PreparedMarkdown"
