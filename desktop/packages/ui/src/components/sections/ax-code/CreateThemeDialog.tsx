import React from "react"

import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { toast } from "@/components/ui"
import { isDesktopLocalOriginActive } from "@/lib/desktop"
import { API_ENDPOINTS } from "@/lib/http"
import { useI18n } from "@/lib/i18n"
import { checkThemeContrast } from "@/lib/theme/themeContrast"
import { generateTheme } from "@/lib/theme/generateTheme"
import type { Theme } from "@/types/theme"

type ThemeVariant = "light" | "dark"

type CreateThemeDialogProps = {
  open: boolean
  onOpenChange: (open: boolean) => void
  reloadCustomThemes: () => Promise<void>
  /** Selects the saved theme once the reloaded theme list contains it. */
  onThemeSaved: (saved: { id: string; variant: ThemeVariant }) => void
}

const slugify = (value: string) => {
  const ascii = value.normalize("NFKD").replace(/[\u0300-\u036f]/g, "")
  const slug = ascii
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 60)
  return slug.replace(/-+$/g, "") || "theme"
}

const isHexColor = (value: string) => /^#[0-9a-f]{6}$/i.test(value)

function Preview({ theme, name }: { theme: Theme; name: string }) {
  const { t } = useI18n()
  const { colors } = theme

  return (
    <div
      className="space-y-3 rounded-xl border p-4"
      style={{
        backgroundColor: colors.surface.background,
        color: colors.surface.foreground,
        borderColor: colors.interactive.border,
      }}
    >
      <div
        className="rounded-lg border p-4 shadow-sm"
        style={{ backgroundColor: colors.surface.elevated, borderColor: colors.interactive.border }}
      >
        <div className="font-medium">{name || t("settings.openchamber.visual.createTheme.previewTitle")}</div>
        <p className="mt-1 text-sm" style={{ color: colors.surface.mutedForeground }}>
          {t("settings.openchamber.visual.createTheme.previewBody")}
        </p>
        <button
          type="button"
          className="mt-3 rounded-md px-3 py-1.5 text-sm font-medium"
          style={{ backgroundColor: colors.primary.base, color: colors.primary.foreground }}
        >
          {t("settings.openchamber.visual.createTheme.previewButton")}
        </button>
      </div>
      <div className="flex items-center gap-2 text-xs">
        <span>{t("settings.openchamber.visual.createTheme.previewBorder")}</span>
        <span className="h-4 flex-1 rounded border" style={{ borderColor: colors.interactive.border }} />
      </div>
    </div>
  )
}

export function CreateThemeDialog({ open, onOpenChange, reloadCustomThemes, onThemeSaved }: CreateThemeDialogProps) {
  const { t } = useI18n()
  const nameId = React.useId()
  const baseId = React.useId()
  const accentId = React.useId()
  const [name, setName] = React.useState("")
  const [variant, setVariant] = React.useState<ThemeVariant>("dark")
  const [base, setBase] = React.useState("#24262d")
  const [accent, setAccent] = React.useState("#6d75e8")
  const [contrast, setContrast] = React.useState(0.5)
  const [saving, setSaving] = React.useState(false)
  const [theme, setTheme] = React.useState<Theme | null>(null)

  const trimmedName = name.trim()
  const id = `generated-${slugify(trimmedName)}`

  React.useEffect(() => {
    if (!isHexColor(base) || !isHexColor(accent)) {
      setTheme(null)
      return
    }
    try {
      setTheme(
        generateTheme({
          id,
          name: trimmedName || t("settings.openchamber.visual.createTheme.previewTitle"),
          variant,
          base,
          accent,
          contrast,
        }),
      )
    } catch {
      setTheme(null)
    }
  }, [accent, base, contrast, id, trimmedName, t, variant])

  const hardFailures = theme ? checkThemeContrast(theme).filter((failure) => failure.severity === "hard") : []

  const saveTheme = async () => {
    if (!theme || !trimmedName || hardFailures.length > 0 || saving) return
    setSaving(true)
    try {
      const response = await fetch(API_ENDPOINTS.config.themes, {
        method: "POST",
        credentials: isDesktopLocalOriginActive() ? "omit" : "include",
        headers: { Accept: "application/json", "Content-Type": "application/json" },
        body: JSON.stringify({ theme }),
      })
      if (!response.ok) {
        throw new Error("Theme save failed")
      }
      onThemeSaved({ id: theme.metadata.id, variant })
      await reloadCustomThemes()
      onOpenChange(false)
      toast.success(t("settings.openchamber.visual.createTheme.toast.saved"))
    } catch {
      toast.error(t("settings.openchamber.visual.createTheme.toast.failed"))
    } finally {
      setSaving(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={(nextOpen) => !saving && onOpenChange(nextOpen)}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>{t("settings.openchamber.visual.createTheme.title")}</DialogTitle>
          <DialogDescription>{t("settings.openchamber.visual.createTheme.description")}</DialogDescription>
        </DialogHeader>

        <div className="grid gap-5 md:grid-cols-2">
          <div className="space-y-4">
            <div className="space-y-1.5">
              <label htmlFor={nameId} className="typography-ui-label font-medium text-foreground">
                {t("settings.openchamber.visual.createTheme.name")}
              </label>
              <Input id={nameId} value={name} onChange={(event) => setName(event.target.value)} disabled={saving} />
            </div>

            <fieldset className="space-y-1.5">
              <legend className="typography-ui-label font-medium text-foreground">
                {t("settings.openchamber.visual.createTheme.mode")}
              </legend>
              <div className="flex gap-2">
                {(["light", "dark"] as const).map((mode) => (
                  <Button
                    key={mode}
                    type="button"
                    size="sm"
                    variant="chip"
                    aria-pressed={variant === mode}
                    disabled={saving}
                    onClick={() => setVariant(mode)}
                  >
                    {t(`settings.openchamber.visual.createTheme.${mode}` as Parameters<typeof t>[0])}
                  </Button>
                ))}
              </div>
            </fieldset>

            {(
              [
                ["base", base, setBase, baseId],
                ["accent", accent, setAccent, accentId],
              ] as const
            ).map(([key, value, setter, inputId]) => (
              <div key={key} className="space-y-1.5">
                <label htmlFor={inputId} className="typography-ui-label font-medium text-foreground">
                  {t(`settings.openchamber.visual.createTheme.${key}` as Parameters<typeof t>[0])}
                </label>
                <div className="flex gap-2">
                  <input
                    aria-label={t(`settings.openchamber.visual.createTheme.${key}` as Parameters<typeof t>[0])}
                    className="h-9 w-12 cursor-pointer rounded border border-border bg-transparent p-1"
                    type="color"
                    value={isHexColor(value) ? value : "#000000"}
                    onChange={(event) => setter(event.target.value)}
                    disabled={saving}
                  />
                  <Input
                    id={inputId}
                    value={value}
                    onChange={(event) => setter(event.target.value)}
                    disabled={saving}
                  />
                </div>
              </div>
            ))}

            <div className="space-y-1.5">
              <label htmlFor="theme-contrast" className="typography-ui-label font-medium text-foreground">
                {t("settings.openchamber.visual.createTheme.contrast")} ({contrast.toFixed(2)})
              </label>
              <input
                id="theme-contrast"
                className="w-full accent-primary"
                type="range"
                min="0"
                max="1"
                step="0.01"
                value={contrast}
                onChange={(event) => setContrast(Number(event.target.value))}
                disabled={saving}
              />
            </div>
          </div>

          <div className="space-y-2">
            <h3 className="typography-ui-label font-medium text-foreground">
              {t("settings.openchamber.visual.createTheme.preview")}
            </h3>
            {theme ? <Preview theme={theme} name={trimmedName} /> : null}
            <div aria-live="polite" className="rounded-lg border border-border/60 p-3 typography-ui-label">
              {!theme ? null : hardFailures.length === 0 ? (
                <p>{t("settings.openchamber.visual.createTheme.passesContrast")}</p>
              ) : (
                <div>
                  <p className="mb-1 font-medium text-status-error">
                    {t("settings.openchamber.visual.createTheme.hardFailures")}
                  </p>
                  <ul className="list-disc space-y-1 pl-5">
                    {hardFailures.map((failure) => (
                      <li key={failure.rule}>{failure.rule}</li>
                    ))}
                  </ul>
                </div>
              )}
            </div>
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={saving}>
            {t("settings.openchamber.visual.createTheme.cancel")}
          </Button>
          <Button
            onClick={() => void saveTheme()}
            disabled={saving || !trimmedName || hardFailures.length > 0 || !theme}
          >
            {saving
              ? t("settings.openchamber.visual.createTheme.saving")
              : t("settings.openchamber.visual.createTheme.save")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
