import * as React from "react"
import { motion, type MotionProps } from "motion/react"
import { cn } from "@/lib/utils"

type Variant = {
  variant: string
  component: React.FC<React.ComponentProps<"span"> & Partial<MotionProps>>
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
    component: ({ children, className, ...props }) => {
      if (children === null || typeof children === "undefined") return null

      const textContent =
        typeof children === "string"
          ? children
          : typeof children === "number"
            ? String(children)
            : Array.isArray(children)
              ? children
                  .map((item) => (typeof item === "string" || typeof item === "number" ? String(item) : ""))
                  .join("")
              : ""

      if (!textContent) return null

      return (
        <span className={cn("inline-block align-baseline", className)}>
          {textContent.split("").map((char, index) => (
            <motion.span
              {...props}
              key={char + String(index)}
              className={cn("inline-block whitespace-pre align-baseline")}
              initial={{ opacity: 0 }}
              animate={{
                opacity: 1,
              }}
              transition={{
                ease: "easeOut",
                duration: 0.14,
                delay: Math.min(index * 0.0045, 0.14),
              }}
            >
              {char}
            </motion.span>
          ))}
        </span>
      )
    },
  },
] as const satisfies readonly Variant[]

export type TextProps = {
  variant?: (typeof variants)[number]["variant"]
} & React.ComponentProps<"span"> &
  Partial<MotionProps>

export function Text({ variant = "static", className, ...props }: TextProps) {
  const variantComponent = variants.find((v) => v.variant === variant)?.component

  const Component = variantComponent || variants[0].component

  return <Component {...props} className={className} />
}
