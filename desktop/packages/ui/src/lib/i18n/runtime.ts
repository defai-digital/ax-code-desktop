import manifest from "../../../../../shared/locales.json" with { type: "json" }
import { locales } from "../../../../../shared/localization.mjs"
export {
  isLocale,
  localeDirection,
  resolveLocale,
  conversationInstruction,
} from "../../../../../shared/localization.mjs"
export type {
  Locale,
  InterfacePreference,
  ConversationPreference,
  TextDirection,
} from "../../../../../shared/localization.mjs"
import type { Locale } from "../../../../../shared/localization.mjs"

export const LOCALES = locales as readonly Locale[]
export const DEFAULT_LOCALE: Locale = "en"
export const LANGUAGE_LABELS = manifest.labels
