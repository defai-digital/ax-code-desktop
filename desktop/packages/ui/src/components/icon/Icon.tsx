import React from "react"
import { cn } from "@/lib/utils"
import { ICON_VIEWBOX, iconSpriteData } from "./sprite"
import type { IconName } from "./icons"

const SPRITE_ID = "ax-icon-sprite"
const SYMBOL_PREFIX = "ax-icon-"

let spriteInjected = false

function ensureSpriteOnce() {
  if (spriteInjected) return
  if (typeof document === "undefined") return
  const body = document.body
  if (!body) return

  const existing = document.getElementById(SPRITE_ID)
  if (existing) {
    spriteInjected = true
    return
  }

  const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg")
  svg.id = SPRITE_ID
  svg.setAttribute("aria-hidden", "true")
  svg.style.display = "none"
  svg.innerHTML = Object.entries(iconSpriteData)
    .map(([name, content]) => `<symbol id="${SYMBOL_PREFIX}${name}" viewBox="${ICON_VIEWBOX}">${content}</symbol>`)
    .join("")
  body.insertBefore(svg, body.firstChild)
  spriteInjected = true
}

interface IconProps extends React.ComponentPropsWithoutRef<"svg"> {
  name: IconName
}

export const Icon = React.memo(({ name, className, ...rest }: IconProps) => {
  // Inline sprite injection during render – must run before <use> tries
  // to resolve the #ax-icon-* reference during the same commit.
  if (typeof document !== "undefined") {
    ensureSpriteOnce()
  }

  return (
    <svg
      className={cn("ax-icon", className)}
      viewBox={ICON_VIEWBOX}
      xmlns="http://www.w3.org/2000/svg"
      aria-hidden="true"
      {...rest}
    >
      <use href={`#${SYMBOL_PREFIX}${name}`} />
    </svg>
  )
})

Icon.displayName = "Icon"
