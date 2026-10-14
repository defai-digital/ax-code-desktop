import type { Theme } from "@/types/theme"
import { contrastRatio, withAlpha } from "./oklch"

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
// text and text on solid primary fills); report rules surface softer issues that
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
    backdrop = surface.background,
  ) => {
    const ratio = contrastRatio(foreground, background, backdrop)
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

  // Mirror button.tsx: --primary-base supplies both the text and the tint.
  // Curated themes report this newer rule; generated palettes must pass it.
  const isDark = theme.metadata.variant === "dark"
  for (const [state, alpha] of Object.entries(
    isDark ? { default: 0.16, hover: 0.22, active: 0.3 } : { default: 0.1, hover: 0.16, active: 0.22 },
  )) {
    for (const [surfaceName, backdrop] of Object.entries({
      background: surface.background,
      muted: surface.muted,
      elevated: surface.elevated,
    })) {
      check(
        `button.primary-${state}-on-${surfaceName}`,
        "report",
        primary.base,
        withAlpha(primary.base, alpha),
        4.5,
        isDark ? backdrop : surface.background,
      )
    }
  }

  return failures
}

// The generated palette has a stricter contract than curated themes. Keep
// these text rules separate so adding coverage does not rewrite bundled palettes.
export function checkGeneratedThemeContrast(theme: Theme): ThemeContrastFailure[] {
  const failures = checkThemeContrast(theme).map((failure) =>
    failure.rule.startsWith("button.") ? { ...failure, severity: "hard" as const } : failure,
  )
  const { surface, status, syntax, tools } = theme.colors
  const check = (rule: string, foreground: string, background: string, backdrop = surface.background) => {
    const ratio = contrastRatio(foreground, background, backdrop)
    if (ratio < 4.5) {
      failures.push({ rule, severity: "hard", foreground, background, ratio, required: 4.5 })
    }
  }

  const isDark = theme.metadata.variant === "dark"
  for (const [state, alpha] of Object.entries(
    isDark ? { default: 0.09, hover: 0.14, active: 0.2 } : { default: 0.07, hover: 0.11, active: 0.16 },
  )) {
    check(
      `button.destructive-${state}`,
      status.error,
      withAlpha(status.error, alpha),
      isDark ? surface.elevated : surface.background,
    )
  }

  for (const name of ["success", "warning", "error", "info"] as const) {
    for (const [surfaceName, backdrop] of Object.entries({
      background: surface.background,
      muted: surface.muted,
      elevated: surface.elevated,
    })) {
      check(`status.${name}-on-${surfaceName}`, status[name], backdrop)
      check(`status.${name}-on-tint-${surfaceName}`, status[name], status[`${name}Background`], backdrop)
    }
    check(`status.${name}Foreground-on-${name}`, status[`${name}Foreground`], status[name])
  }

  const backgrounds = { canvas: surface.background, syntax: syntax.base.background }
  for (const [group, tokens] of Object.entries({ base: syntax.base, tokens: syntax.tokens, ...syntax.languages })) {
    for (const [name, color] of Object.entries(tokens ?? {})) {
      if (name === "background" || !color) continue
      for (const [backgroundName, background] of Object.entries(backgrounds)) {
        check(`syntax.${group}.${name}-on-${backgroundName}`, color, background)
        for (const [highlight, tint] of Object.entries(syntax.highlights ?? {})) {
          if (highlight.endsWith("Background")) {
            check(`syntax.${group}.${name}-on-${highlight}-${backgroundName}`, color, tint, background)
          }
        }
      }
    }
  }
  for (const [name, color] of Object.entries(syntax.highlights ?? {})) {
    if (name.endsWith("Background")) continue
    for (const [backgroundName, background] of Object.entries(backgrounds)) {
      check(`syntax.highlights.${name}-on-${backgroundName}`, color, background)
      const tint = syntax.highlights?.[`${name}Background`]
      if (tint) check(`syntax.highlights.${name}-on-tint-${backgroundName}`, color, tint, background)
    }
  }
  for (const name of ["added", "removed"] as const) {
    const color = tools?.edit?.[name]
    const tint = tools?.edit?.[`${name}Background`]
    if (color && tint) check(`tools.edit.${name}-on-tint`, color, tint)
  }
  return failures
}
