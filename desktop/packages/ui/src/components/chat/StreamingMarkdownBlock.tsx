import React from "react"

// Keyed by index, so it stays mounted while the live tail block re-keys on
// every token; whether it animates is decided once, when it mounts. The first
// block never animates, and blocks committed in one pass cascade.
export const StreamingMarkdownBlock: React.FC<{ index: number; enteredBlockCount: number; children: React.ReactNode }> = ({
  index,
  enteredBlockCount,
  children,
}) => {
  const [enterDelayMs] = React.useState<number | null>(() =>
    index > 0 && index >= enteredBlockCount ? Math.min(index - enteredBlockCount, 4) * 55 : null,
  )
  if (enterDelayMs === null) return <div data-md-block="">{children}</div>
  return (
    <div
      data-md-block=""
      className="oc-md-block-enter"
      style={enterDelayMs > 0 ? ({ "--oc-md-enter-delay": `${enterDelayMs}ms` } as React.CSSProperties) : undefined}
    >
      {children}
    </div>
  )
}
