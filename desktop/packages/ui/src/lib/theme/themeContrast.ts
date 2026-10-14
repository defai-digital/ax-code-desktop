import type { Theme } from "@/types/theme"
import { contrastRatio } from "./oklch"

export type ContrastSeverity = "hard" | "report"

export interface ThemeContrastFailure {
  rule: string
  severity: ContrastSeverity
  foreground: string
  background: string
  ratio: number
  required: number
}

// Audit a theme's core text and border pairings. Hard rules must pass (body
// text and text on primary buttons); report rules surface softer issues that
// curated palettes may legitimately accept.
export function checkThemeContrast(theme: Theme): ThemeContrastFailure[] {
  const { surface, primary, interactive } = theme.colors
  const failures: ThemeContrastFailure[] = []

  const check = (
    rule: string,
    severity: ContrastSeverity,
    foreground: string,
    background: string,
    required: number,
  ) => {
    const ratio = contrastRatio(foreground, background)
    if (ratio < required) {
      failures.push({ rule, severity, foreground, background, ratio, required })
    }
  }

  // Mirror the CSS generator's fallback so undefined primary foregrounds are
  // audited against the color that actually ships.
  const primaryForeground = primary.foreground ?? "#ffffff"

  check("surface.foreground-on-background", "hard", surface.foreground, surface.background, 4.5)
  check("surface.mutedForeground-on-background", "report", surface.mutedForeground, surface.background, 3)
  check("primary.foreground-on-primary.base", "hard", primaryForeground, primary.base, 4.5)
  check("interactive.border-on-background", "report", interactive.border, surface.background, 1.2)

  return failures
}
