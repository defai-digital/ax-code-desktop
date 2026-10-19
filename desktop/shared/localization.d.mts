import manifest from "./locales.json"
export type Locale = keyof typeof manifest.labels
export type InterfacePreference = Locale | "system"
export type ConversationPreference = Locale | "auto"
export type TextDirection = "ltr" | "rtl"
export type LanguagePreferences = {
  schema: 1
  interface: InterfacePreference
  conversation: ConversationPreference
  revision: number
}
export type ResolvedLanguagePreferences = LanguagePreferences & { locale: Locale; formatLocale: string }
export const locales: Locale[]
export function isLocale(value: unknown): value is Locale
export function localeDirection(code: unknown): TextDirection
export function resolveLocale(value: unknown): { locale: Locale; formatLocale: string } | undefined
export function normalizePreferences(value: unknown): LanguagePreferences
export function resolvePreferences(
  value: LanguagePreferences,
  languages?: readonly string[],
): ResolvedLanguagePreferences
export function validatePatch(value: unknown): Partial<Pick<LanguagePreferences, "interface" | "conversation">>
export function conversationInstruction(value: ConversationPreference): string | undefined
export function createLanguageController(options: {
  read: () => unknown
  write: (value: LanguagePreferences) => Promise<void>
  systemLanguages: () => readonly string[]
  onChange?: (value: ResolvedLanguagePreferences) => void
}): { get: () => ResolvedLanguagePreferences; update: (value: unknown) => Promise<ResolvedLanguagePreferences> }
