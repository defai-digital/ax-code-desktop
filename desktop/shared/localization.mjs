import manifest from "./locales.json" with { type: "json" }
const locales = Object.keys(manifest.labels)
const isLocale = (value) => typeof value === "string" && Object.hasOwn(manifest.labels, value)
// Base languages written right to left. They resolve to "rtl" even before a locale entry declares it.
const rtlLanguages = new Set(["ar", "he", "fa", "ur"])

// Writing direction of a locale code. An explicit `directions` entry in locales.json wins; otherwise the base
// language decides, and anything unknown or malformed is left to right.
function localeDirection(code) {
  if (typeof code !== "string") return "ltr"
  const declared = Object.hasOwn(manifest.directions || {}, code) ? manifest.directions[code] : undefined
  if (declared === "rtl" || declared === "ltr") return declared
  try {
    return rtlLanguages.has(new Intl.Locale(code.replace(/_/g, "-")).language) ? "rtl" : "ltr"
  } catch {
    return "ltr"
  }
}

function resolveLocale(value) {
  if (typeof value !== "string") return undefined
  try {
    const tag = new Intl.Locale(value.replace(/_/g, "-"))
    const full = tag.maximize()
    const messageLocale =
      full.language === "zh"
        ? full.script === "Hant"
          ? "zh-TW"
          : "zh-CN"
        : full.language === "pt"
          ? "pt-BR"
          : full.language
    if (!isLocale(messageLocale)) return undefined
    return { locale: messageLocale, formatLocale: tag.toString() }
  } catch {
    return undefined
  }
}

function resolvePreferences(preferences, systemLanguages = []) {
  const selected =
    preferences.interface === "system"
      ? systemLanguages.map(resolveLocale).find(Boolean)
      : { locale: preferences.interface, formatLocale: preferences.interface }
  return { ...preferences, ...(selected || { locale: "en", formatLocale: "en" }) }
}

function normalizePreferences(value) {
  const valid =
    value && typeof value === "object" && !Array.isArray(value) && (value.schema === undefined || value.schema === 1)
      ? value
      : {}
  return {
    schema: 1,
    interface: valid.interface === "system" || isLocale(valid.interface) ? valid.interface : "system",
    conversation: valid.conversation === "auto" || isLocale(valid.conversation) ? valid.conversation : "auto",
    revision: Number.isSafeInteger(valid.revision) && valid.revision >= 0 ? valid.revision : 0,
  }
}

function validatePatch(value) {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error("Invalid language preferences")
  const keys = Object.keys(value)
  if (!keys.length || keys.some((key) => !["interface", "conversation"].includes(key))) {
    throw new Error("Unknown language preference")
  }
  if (Object.hasOwn(value, "interface") && value.interface !== "system" && !isLocale(value.interface)) {
    throw new Error("Unsupported interface language")
  }
  if (Object.hasOwn(value, "conversation") && value.conversation !== "auto" && !isLocale(value.conversation)) {
    throw new Error("Unsupported conversation language")
  }
  return value
}

function createLanguageController({ read, write, systemLanguages, onChange = () => {} }) {
  let preferences = normalizePreferences(read())
  let chain = Promise.resolve()
  const get = () => resolvePreferences(preferences, systemLanguages())
  return {
    get,
    update: (value) => {
      const patch = { ...validatePatch(value) }
      const next = chain.then(async () => {
        const candidate = { ...preferences, ...patch, revision: preferences.revision + 1 }
        // Resolve the state before the write. Reading it afterwards meant a throwing
        // system-language lookup rejected a save that had already been committed, and the
        // caller retried a state that was already correct.
        const state = resolvePreferences(candidate, systemLanguages())
        await write(candidate)
        preferences = candidate
        try {
          onChange(state)
        } catch (error) {
          console.error("Failed to notify windows of committed language preferences", error)
        }
        return state
      })
      chain = next.catch(() => {})
      return next
    },
  }
}

function conversationInstruction(locale) {
  if (!isLocale(locale)) return undefined
  return [
    `Conversation preference: write user-facing explanations and summaries in ${manifest.conversationNames[locale]}.`,
    "This is a preference only. Explicit user language requests and project instructions take precedence.",
    "Follow project rules for code comments, commits, and documents; otherwise keep these artifacts in English.",
    "Preserve technical identifiers, commands, paths, quoted evidence, original task constraints, test results, and raw tool output exactly.",
    "Do not translate evidence before aggregation or change approval scope, severity, support counts, rankings, or verification state.",
  ].join("\n")
}

export {
  locales,
  isLocale,
  localeDirection,
  resolveLocale,
  resolvePreferences,
  normalizePreferences,
  validatePatch,
  createLanguageController,
  conversationInstruction,
}
