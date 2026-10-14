import * as React from "react"
import { cn } from "@/lib/utils"

type Variant = {
  variant: string
  component: React.FC<React.ComponentProps<"span">>
}

const variants = [
  {
    variant: "static",
    component: ({ children, className, ...props }) => (
      <span {...props} className={className}>
        {children}
      </span>
    ),
  },
  {
    variant: "generate-effect",
    // One CSS fade over the whole text (`.oc-text-generate` in index.css), not
    // a span and a JS animation per character: streaming tool rows mount these
    // constantly, and upstream measured the per-character version at a quarter
    // of the main thread's work in an agent run. The fade plays once on mount;
    // text that changes afterwards updates in place without replaying it.
    component: ({ children, className, ...props }) => {
      if (children === null || children === undefined || children === "") return null

      return (
        <span {...props} className={cn("oc-text-generate inline-block align-baseline", className)}>
          {children}
        </span>
      )
    },
  },
] as const satisfies readonly Variant[]

export type TextProps = {
  variant?: (typeof variants)[number]["variant"]
} & React.ComponentProps<"span">

export function Text({ variant = "static", className, ...props }: TextProps) {
  const variantComponent = variants.find((v) => v.variant === variant)?.component

  const Component = variantComponent || variants[0].component

  return <Component {...props} className={className} />
}
