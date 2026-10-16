import { create } from "zustand"
import { getDesktopBridge } from "../desktopBridge"
import { dict as enDict, type I18nKey } from "./messages/en"
import { DEFAULT_LOCALE, type Locale, type InterfacePreference, type ConversationPreference } from "./runtime"
import { normalizePreferences, resolvePreferences, validatePatch } from "../../../../../shared/localization.mjs"
import type { LanguagePreferences, ResolvedLanguagePreferences } from "../../../../../shared/localization.mjs"

export type I18nParams = Record<string, string | number | boolean | null | undefined>
export type I18nDictionary = Record<I18nKey, string>
const loaders: Record<Exclude<Locale, "en">, () => Promise<{ default: Record<string, string> }>> = {
  "zh-TW": () => import("./messages/zh-TW.json"),
  "zh-CN": () => import("./messages/zh-CN.json"),
  ja: () => import("./messages/ja.json"),
  ko: () => import("./messages/ko.json"),
  fr: () => import("./messages/fr.json"),
  de: () => import("./messages/de.json"),
  id: () => import("./messages/id.json"),
  it: () => import("./messages/it.json"),
  "pt-BR": () => import("./messages/pt-BR.json"),
  ru: () => import("./messages/ru.json"),
  es: () => import("./messages/es.json"),
  tr: () => import("./messages/tr.json"),
  vi: () => import("./messages/vi.json"),
}
const dictionaries = new Map<Locale, I18nDictionary>([[DEFAULT_LOCALE, enDict]])
const inFlight = new Map<Locale, Promise<I18nDictionary>>()
const STORAGE_KEY = "ax-coder.language.v1"
const systemLanguages = () => (typeof navigator === "undefined" ? [] : navigator.languages)
const initial = resolvePreferences(normalizePreferences(undefined), [])
let requestSequence = 0
let initialization: Promise<void> | undefined
let dispose: (() => void) | undefined

export function resetI18nDictionaryCacheForTests(): void {
  dispose?.()
  dispose = undefined
  initialization = undefined
  requestSequence++
  dictionaries.clear()
  dictionaries.set(DEFAULT_LOCALE, enDict)
  inFlight.clear()
}

export async function loadDictionary(locale: Locale): Promise<I18nDictionary> {
  const cached = dictionaries.get(locale)
  if (cached) return cached
  const pending = inFlight.get(locale)
  if (pending) return pending
  const request = loaders[locale as Exclude<Locale, "en">]()
    .then(({ default: dictionary }) => {
      if (
        Object.keys(dictionary).length !== Object.keys(enDict).length ||
        Object.keys(enDict).some((key) => typeof dictionary[key as I18nKey] !== "string")
      ) {
        throw new Error("Invalid language catalog")
      }
      dictionaries.set(locale, dictionary as I18nDictionary)
      return dictionary as I18nDictionary
    })
    .finally(() => inFlight.delete(locale))
  inFlight.set(locale, request)
  return request
}

async function applyPreferences(value: ResolvedLanguagePreferences): Promise<void> {
  if (value.revision < useI18nStore.getState().revision) return
  const sequence = ++requestSequence
  useI18nStore.setState({
    interface: value.interface,
    conversation: value.conversation,
    revision: value.revision,
    loadingLocale: value.locale,
    loadingError: false,
  })
  try {
    const dictionary = await loadDictionary(value.locale)
    if (sequence !== requestSequence) return
    useI18nStore.setState({
      locale: value.locale,
      dictionary,
      formatLocale: value.formatLocale,
      loadingLocale: null,
      loadingError: false,
    })
  } catch {
    if (sequence !== requestSequence) return
    useI18nStore.setState({
      locale: "en",
      dictionary: enDict,
      formatLocale: "en",
      loadingLocale: null,
      loadingError: true,
    })
  }
}

function parsePreferences(value: unknown): ResolvedLanguagePreferences {
  const prefs = normalizePreferences(value)
  const state = value as Partial<ResolvedLanguagePreferences> | null
  // Main provides the preferred OS language list's resolved result. Validate
  // the formatting tag; a malformed tag must never reach Intl constructors.
  const resolved = resolvePreferences(prefs, systemLanguages())
  if (state && typeof state.locale === "string" && (Object.hasOwn(loaders, state.locale) || state.locale === "en")) {
    try {
      const formatLocale = new Intl.Locale(state!.formatLocale || state!.locale!).toString()
      return { ...prefs, locale: state!.locale as Locale, formatLocale }
    } catch {
      return { ...prefs, locale: state.locale as Locale, formatLocale: state.locale }
    }
  }
  return resolved
}

// Serializes the browser/standalone read-modify-write below. The main process path
// is already serialized by its own controller; without this, two rapid saves (or two
// tabs) computed the same next revision and the `revision <` guard let the older
// write win.
let saveChain: Promise<void> = Promise.resolve()

const readStoredPreferences = (): LanguagePreferences | null => {
  if (typeof window === "undefined") return null
  try {
    const parsed = JSON.parse(window.localStorage.getItem(STORAGE_KEY) || "null")
    if (!parsed || typeof parsed !== "object") return null
    return normalizePreferences(parsed)
  } catch {
    return null
  }
}

async function savePreferences(patch: Partial<Pick<LanguagePreferences, "interface" | "conversation">>): Promise<void> {
  validatePatch(patch)
  const bridge = getDesktopBridge()
  if (bridge?.invoke) {
    const state = await bridge.invoke("desktop_language_set", patch)
    await applyPreferences(parsePreferences(state))
    return
  }

  // Only the read-modify-write is serialized: applying a preference waits for the
  // locale dictionary, and queueing that would deadlock two saves when a dictionary
  // load is slow (a later save would wait for the earlier apply to finish).
  const run = saveChain.then(() => {
    const current = useI18nStore.getState()
    // Another tab may have saved since this one last applied. Its revision has to be taken into
    // account, and so does the field it changed: merging only the revision wrote this tab's stale
    // value back over the other tab's, and the higher revision then discarded that tab's own value.
    // Start from the newer record and apply only this tab's change.
    const stored = readStoredPreferences()
    const storedRev = stored?.revision ?? 0
    const base = stored && storedRev > current.revision ? stored : current
    const revision = Math.max(current.revision, storedRev) + 1
    const next = normalizePreferences({ ...base, ...patch, revision })
    if (typeof window !== "undefined") window.localStorage.setItem(STORAGE_KEY, JSON.stringify(next))
    return resolvePreferences(next, systemLanguages())
  })
  saveChain = run.then(
    () => {},
    () => {},
  )
  return applyPreferences(await run)
}

type I18nState = ResolvedLanguagePreferences & {
  dictionary: I18nDictionary
  loadingLocale: Locale | null
  loadingError: boolean
  setLocale: (locale: Locale) => Promise<void>
  setInterface: (locale: InterfacePreference) => Promise<void>
  setConversation: (locale: ConversationPreference) => Promise<void>
}
export const useI18nStore = create<I18nState>()(() => ({
  ...initial,
  dictionary: enDict,
  loadingLocale: null,
  loadingError: false,
  setLocale: (locale) => savePreferences({ interface: locale }),
  setInterface: (locale) => savePreferences({ interface: locale }),
  setConversation: (locale) => savePreferences({ conversation: locale }),
}))

export function initializeLocale(): Promise<void> {
  if (initialization) return initialization
  let startupSequence = requestSequence
  const work = (async () => {
    const bridge = getDesktopBridge()
    if (bridge?.invoke) {
      if (bridge.listen) {
        dispose = await bridge.listen("openchamber:language-changed", ({ payload }) => {
          void applyPreferences(parsePreferences(payload))
        })
      }
      const preferences = parsePreferences(await bridge.invoke("desktop_language_get"))
      const applying = applyPreferences(preferences)
      startupSequence = requestSequence
      await applying
    } else {
      let saved: unknown
      try {
        saved = JSON.parse(window.localStorage.getItem(STORAGE_KEY) || "null")
      } catch {
        /* Defaults survive corrupt storage. */
      }
      const listener = (event: StorageEvent) => {
        if (event.key !== STORAGE_KEY) return
        try {
          void applyPreferences(parsePreferences(JSON.parse(event.newValue || "null")))
        } catch {
          /* Ignore corrupt external writes. */
        }
      }
      window.addEventListener("storage", listener)
      dispose = () => window.removeEventListener("storage", listener)
      const applying = applyPreferences(parsePreferences(saved))
      startupSequence = requestSequence
      await applying
    }
  })().catch(() => {
    if (startupSequence !== requestSequence) return
    useI18nStore.setState({
      locale: "en",
      dictionary: enDict,
      formatLocale: "en",
      loadingLocale: null,
      loadingError: true,
    })
  })
  let timer: ReturnType<typeof setTimeout> | undefined
  const timeout = new Promise<void>((resolve) => {
    timer = setTimeout(() => {
      if (startupSequence === requestSequence) {
        useI18nStore.setState({
          locale: "en",
          dictionary: enDict,
          formatLocale: "en",
          loadingLocale: null,
          loadingError: true,
        })
      }
      resolve()
    }, 3000)
  })
  initialization = Promise.race([work, timeout]).finally(() => clearTimeout(timer))
  return initialization
}

export function formatMessage(dictionary: I18nDictionary, key: I18nKey, params?: I18nParams): string {
  const template = dictionary[key] ?? enDict[key] ?? key
  if (!params) return template
  return template.replace(/\{([^{}]+)\}/g, (match, rawKey) => {
    const name = rawKey.trim()
    const value = Object.hasOwn(params, name) ? params[name] : undefined
    return value === null || value === undefined ? match : String(value)
  })
}

export function formatPluralMessage(
  dictionary: I18nDictionary,
  locale: Locale,
  key: "common.itemCount",
  count: number,
): string {
  const category = new Intl.PluralRules(locale).select(count)
  return formatMessage(dictionary, `${key}.${category}` as I18nKey, { count })
}
export type { I18nKey }
