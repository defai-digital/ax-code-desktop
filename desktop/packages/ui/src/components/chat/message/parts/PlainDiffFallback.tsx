import type React from "react"

interface PlainDiffFallbackProps {
  diff: string
}

export const PlainDiffFallback = (props: PlainDiffFallbackProps): React.ReactNode => (
  <pre
    className="m-0 overflow-auto whitespace-pre-wrap break-words rounded-lg p-2 typography-code"
    style={{
      backgroundColor: "var(--syntax-base-background)",
      color: "var(--syntax-base-foreground)",
    }}
  >
    {props.diff}
  </pre>
)
