const TERMINAL_FONT_FAMILIES = ["JetBrainsMono Nerd Font", "FiraCode Nerd Font"] as const

export function buildTerminalFontSrc(family: string): string {
  if (!TERMINAL_FONT_FAMILIES.some((name) => name === family)) throw new Error(`Unknown terminal font: ${family}`)
  return `local(${JSON.stringify(family)})`
}

// Apply the source policy during both Vite development and production HTML transforms.
export function renderTerminalFontSources(html: string): string {
  return html.replace(
    /(@font-face\s*\{[^}]*?font-family:\s*"(JetBrainsMono Nerd Font|FiraCode Nerd Font)";\s*src:)[^;]+;/g,
    (_match, prefix: string, family: string) => `${prefix} ${buildTerminalFontSrc(family)};`,
  )
}
