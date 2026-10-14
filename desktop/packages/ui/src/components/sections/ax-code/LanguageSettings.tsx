import React from "react"
import { useI18n } from "@/lib/i18n"
import { useI18nStore } from "@/lib/i18n/store"
import { isLocale, type InterfacePreference, type ConversationPreference } from "@/lib/i18n/runtime"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"

export function LanguageSettings() {
  const { t, locales, label } = useI18n()
  const interfaceLanguage = useI18nStore((state) => state.interface)
  const conversation = useI18nStore((state) => state.conversation)
  const formatLocale = useI18nStore((state) => state.formatLocale)
  const loadingLocale = useI18nStore((state) => state.loadingLocale)
  const loadingError = useI18nStore((state) => state.loadingError)
  const [saveError, setSaveError] = React.useState(false)
  const save = (field: "interface" | "conversation", value: string) => {
    if (!isLocale(value) && value !== (field === "interface" ? "system" : "auto")) return
    setSaveError(false)
    const state = useI18nStore.getState()
    void (
      field === "interface"
        ? state.setInterface(value as InterfacePreference)
        : state.setConversation(value as ConversationPreference)
    ).catch(() => setSaveError(true))
  }
  return (
    <section className="px-2 space-y-3" aria-labelledby="language-settings-title">
      <h3 id="language-settings-title" className="typography-ui-header font-medium">
        {t("settings.language.title")}
      </h3>
      {(["interface", "conversation"] as const).map((field) => (
        <div key={field} className="flex min-w-0 flex-col gap-1.5">
          <label id={`language-${field}-label`} className="typography-ui-label">
            {t(`settings.language.${field}`)}
          </label>
          <Select
            value={field === "interface" ? interfaceLanguage : conversation}
            onValueChange={(value) => save(field, value)}
          >
            <SelectTrigger
              aria-labelledby={`language-${field}-label`}
              className="w-full max-w-sm min-h-6 whitespace-normal data-[size=default]:h-auto *:data-[slot=select-value]:line-clamp-none"
            >
              <SelectValue className="min-w-0 break-words text-left">
                {field === "interface"
                  ? interfaceLanguage === "system"
                    ? t("settings.language.system")
                    : label(interfaceLanguage)
                  : conversation === "auto"
                    ? t("settings.language.auto")
                    : label(conversation)}
              </SelectValue>
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={field === "interface" ? "system" : "auto"}>
                {t(field === "interface" ? "settings.language.system" : "settings.language.auto")}
              </SelectItem>
              {locales.map((locale) => (
                <SelectItem key={locale} value={locale}>
                  {label(locale)}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <p className="typography-meta text-muted-foreground">{t(`settings.language.${field}Hint`)}</p>
        </div>
      ))}
      <p className="typography-meta text-muted-foreground">
        {t("settings.language.format")}: {formatLocale}
        {interfaceLanguage === "system" && <>. {t("settings.language.formatHint")}</>}
      </p>
      {(saveError || loadingError) && (
        <p role="alert" className="typography-meta text-destructive">
          {t(saveError ? "settings.language.saveFailed" : "settings.language.loadFailed")}
        </p>
      )}
      {loadingLocale && (
        <p role="status" className="typography-meta text-muted-foreground">
          {t("settings.language.loading")}
        </p>
      )}
    </section>
  )
}
