import React from "react"
import { lazyWithChunkRecovery } from "@/lib/chunkLoadRecovery"

type LazySyntaxHighlighterProps = {
  children?: React.ReactNode
  className?: string
  codeTagProps?: { style?: React.CSSProperties; [key: string]: unknown }
  customStyle?: React.CSSProperties
  dir?: "ltr" | "rtl"
  language?: string
  PreTag?: React.ElementType
  style?: Record<string, React.CSSProperties>
  wrapLines?: boolean
  wrapLongLines?: boolean
}

const SyntaxHighlighter = lazyWithChunkRecovery(() =>
  import("react-syntax-highlighter").then((module) => ({
    default: module.Prism as React.ComponentType<LazySyntaxHighlighterProps>,
  })),
)

const PlainCodeFallback: React.FC<LazySyntaxHighlighterProps> = ({
  children,
  className,
  codeTagProps,
  customStyle,
  PreTag = "pre",
}) => {
  const FallbackPreTag = PreTag

  return (
    <FallbackPreTag className={className} style={customStyle} dir="ltr">
      <code style={codeTagProps?.style}>{children}</code>
    </FallbackPreTag>
  )
}

// Code reads left to right whatever the interface direction; the highlighter forwards `dir` to its pre tag.
export const LazySyntaxHighlighter: React.FC<LazySyntaxHighlighterProps> = (props) => (
  <React.Suspense fallback={<PlainCodeFallback {...props} />}>
    <SyntaxHighlighter {...props} dir="ltr" />
  </React.Suspense>
)
