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

// Pathologically nested or malformed Markdown can throw inside ReactMarkdown's
// render (e.g. a stack overflow in remark). Show the original source instead of
// taking down the whole chat boundary.
class MarkdownRenderBoundary extends React.Component<{ raw: string; children: React.ReactNode }, { failed: boolean }> {
  state = { failed: false }

  static getDerivedStateFromError() {
    return { failed: true }
  }

  componentDidUpdate(prevProps: { raw: string }) {
    if (prevProps.raw !== this.props.raw && this.state.failed) {
      this.setState({ failed: false })
    }
  }

  render() {
    if (this.state.failed) {
      return <div className="whitespace-pre-wrap break-words">{this.props.raw}</div>
    }
    return this.props.children
  }
}

export const PreparedMarkdown = React.memo(
  ({ block, components }: { block: ParsedMarkdownBlock; components: Components }) => {
    if (block.plain) return <div className="whitespace-pre-wrap">{block.raw}</div>
    return (
      <MarkdownRenderBoundary raw={block.raw}>
        <ReactMarkdown
          remarkPlugins={block.tree ? [remarkGfm, remarkMath, [remarkPreparsed, block.tree]] : [remarkGfm, remarkMath]}
          rehypePlugins={[[rehypeKatex, { throwOnError: false, errorColor: "var(--destructive)" }]]}
          components={components}
        >
          {block.src}
        </ReactMarkdown>
      </MarkdownRenderBoundary>
    )
  },
)
PreparedMarkdown.displayName = "PreparedMarkdown"
