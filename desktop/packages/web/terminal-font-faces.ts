const TERMINAL_FONT_FAMILIES = ["JetBrainsMono Nerd Font", "FiraCode Nerd Font"] as const

// Vite copies public/fonts into the web dist root. The packaged app:// handler
// serves that dist, so this root-relative URL stays on the document origin.
export const BUNDLED_TERMINAL_SYMBOL_FONT = "/fonts/symbols-nerd-font-mono.woff2"

// Keep in step with font-src in buildPackagedRendererCsp
// (desktop/packages/electron/src/desktop-renderer-protocol.js).
export const PACKAGED_FONT_SRC_ALLOWLIST = ["'self'", "app://ax-code", "data:"] as const

// Keep in step with font-src in CSP_COMMON_TAIL
// (desktop/packages/web/server/lib/security/response-headers.js).
export const WEB_SERVER_FONT_SRC_ALLOWLIST = ["'self'", "data:"] as const

export function buildTerminalFontSrc(family: string): string {
  if (!TERMINAL_FONT_FAMILIES.some((name) => name === family)) throw new Error(`Unknown terminal font: ${family}`)
  return `local(${JSON.stringify(family)}), url(${JSON.stringify(BUNDLED_TERMINAL_SYMBOL_FONT)}) format("woff2")`
}

// Apply the source policy during both Vite development and production HTML transforms.
export function renderTerminalFontSources(html: string): string {
  return html.replace(
    /(@font-face\s*\{[^}]*?font-family:\s*"(JetBrainsMono Nerd Font|FiraCode Nerd Font)";\s*src:)[^;]+;/g,
    (_match, prefix: string, family: string) => `${prefix} ${buildTerminalFontSrc(family)};`,
  )
}

const FONT_URL_PATTERN = /url\(\s*(?:"([^"]*)"|'([^']*)'|([^)\s]+))\s*\)/g

export function collectFontUrls(css: string): string[] {
  const blocks = css.match(/@font-face\s*\{[^}]*\}/g) ?? []
  return blocks.flatMap((block) =>
    [...block.matchAll(FONT_URL_PATTERN)].map((match) => match[1] ?? match[2] ?? match[3] ?? ""),
  )
}

function hostSourceCovers(source: string, url: string): boolean {
  if (source.startsWith("'")) return false
  return url === source || url.startsWith(`${source}/`)
}

// A root-relative or path-relative URL stays on the document origin ('self').
// An absolute URL must match an explicit host source such as app://ax-code.
export function fontUrlCoveredByFontSrc(url: string, allowlist: readonly string[]): boolean {
  if (url.startsWith("//")) return false
  if (url.startsWith("data:")) return allowlist.includes("data:")
  if (/^[a-z][a-z0-9+.-]*:/i.test(url)) return allowlist.some((source) => hostSourceCovers(source, url))
  return url.length > 0 && allowlist.includes("'self'")
}
