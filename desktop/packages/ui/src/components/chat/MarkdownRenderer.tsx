import React from "react"
import { markdownRendererFactory } from "./markdownRendererChunk"

// Thin lazy wrapper around the heavy MarkdownRenderer implementation.
// The full implementation (marked, react-markdown, beautiful-mermaid,
// react-syntax-highlighter, etc.) is loaded on demand, keeping the
// initial bundle lean. ChatContainer preloads it at idle time; once loaded,
// the factories resolve synchronously so first render does not suspend.

const MarkdownRendererLazy = React.lazy(markdownRendererFactory("MarkdownRenderer"))

const SimpleMarkdownRendererLazy = React.lazy(markdownRendererFactory("SimpleMarkdownRenderer"))

const fallback = <div className="break-words w-full min-w-0" />

export const MarkdownRenderer: React.FC<React.ComponentPropsWithoutRef<typeof MarkdownRendererLazy>> = (props) => (
  <React.Suspense fallback={fallback}>
    <MarkdownRendererLazy {...props} />
  </React.Suspense>
)

export const SimpleMarkdownRenderer: React.FC<React.ComponentPropsWithoutRef<typeof SimpleMarkdownRendererLazy>> = (
  props,
) => (
  <React.Suspense fallback={fallback}>
    <SimpleMarkdownRendererLazy {...props} />
  </React.Suspense>
)
