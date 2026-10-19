import React from "react"
import { useI18nStore, formatMessage, formatPluralMessage } from "./store"
import { I18nContext, type I18nContextValue } from "./react-context"
import { LANGUAGE_LABELS, LOCALES } from "./runtime"
import { applyDocumentLocale } from "./direction"

export const I18nProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const locale = useI18nStore((state) => state.locale)
  const dictionary = useI18nStore((state) => state.dictionary)
  const formatLocale = useI18nStore((state) => state.formatLocale)
  const setLocale = useI18nStore((state) => state.setLocale)
  React.useEffect(() => {
    applyDocumentLocale(locale)
  }, [locale])
  const value = React.useMemo<I18nContextValue>(() => {
    const number = new Intl.NumberFormat(formatLocale)
    const date = new Intl.DateTimeFormat(formatLocale)
    const relative = new Intl.RelativeTimeFormat(formatLocale, { numeric: "auto" })
    return {
      locale,
      formatLocale,
      locales: LOCALES,
      setLocale,
      label: (targetLocale) => LANGUAGE_LABELS[targetLocale],
      t: (key, params) => formatMessage(dictionary, key, params),
      plural: (key, count) => formatPluralMessage(dictionary, locale, key, count),
      number: (value) => number.format(value),
      date: (value) => date.format(value),
      relativeTime: (value, unit) => relative.format(value, unit),
    }
  }, [dictionary, locale, formatLocale, setLocale])
  return <I18nContext.Provider value={value}>{children}</I18nContext.Provider>
}
