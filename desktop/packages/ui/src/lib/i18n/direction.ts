import { localeDirection, type TextDirection } from "./runtime"

/**
 * Reads the dev-only `?dir=rtl` (or `?dir=ltr`) layout-review flag.
 *
 * Production builds always return undefined: `isDev` defaults to `import.meta.env.DEV`, which Vite replaces with
 * `false` so the flag cannot change a shipped app's direction.
 */
export function readDevDirectionOverride(
  search: string | undefined,
  isDev: boolean = import.meta.env.DEV,
): TextDirection | undefined {
  if (!isDev || !search) return undefined
  const value = new URLSearchParams(search).get("dir")
  return value === "rtl" || value === "ltr" ? value : undefined
}

// The router rewrites the query string after start-up, so the flag is captured once per page load.
let initialOverride: TextDirection | undefined | null = null

function initialDevDirectionOverride(): TextDirection | undefined {
  if (initialOverride === null) {
    initialOverride = readDevDirectionOverride(typeof window === "undefined" ? undefined : window.location.search)
  }
  return initialOverride
}

export function resetDevDirectionOverrideForTests(): void {
  initialOverride = null
}

/** The document direction for a locale, honouring the dev-only override. */
export function documentDirection(locale: string): TextDirection {
  return initialDevDirectionOverride() ?? localeDirection(locale)
}

/** Applies `lang` and `dir` for the active locale to the root element. */
export function applyDocumentLocale(
  locale: string,
  root: HTMLElement | undefined = globalThis.document?.documentElement,
): void {
  if (!root) return
  root.lang = locale
  root.dir = documentDirection(locale)
}
