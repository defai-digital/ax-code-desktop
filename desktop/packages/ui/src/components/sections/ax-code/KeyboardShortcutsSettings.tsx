import React from "react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip"
import { Icon } from "@/components/icon/Icon"
import { useUIStore } from "@/stores/useUIStore"
import { cn } from "@/lib/utils"
import {
  formatShortcutForDisplay,
  getCustomizableShortcutActions,
  getEffectiveShortcutCombo,
  isRiskyBrowserShortcut,
  keyToShortcutToken,
  normalizeCombo,
  UNASSIGNED_SHORTCUT,
  type ShortcutCombo,
} from "@/lib/shortcuts"
import { useI18n } from "@/lib/i18n"
import { updateDesktopSettings } from "@/lib/persistence"

const MODIFIER_KEYS = new Set(["shift", "control", "alt", "meta"])

const keyboardEventToCombo = (event: React.KeyboardEvent<HTMLInputElement>): ShortcutCombo | null => {
  if (MODIFIER_KEYS.has(event.key.toLowerCase())) {
    return null
  }

  const parts: string[] = []

  if (event.metaKey || event.ctrlKey) {
    parts.push("mod")
  }
  if (event.shiftKey) {
    parts.push("shift")
  }
  if (event.altKey) {
    parts.push("alt")
  }

  const keyToken = keyToShortcutToken(event.key)
  if (!keyToken) {
    return null
  }

  parts.push(keyToken)
  return normalizeCombo(parts.join("+"))
}

export const KeyboardShortcutsSettings: React.FC = () => {
  const { t } = useI18n()
  const tUnsafe = React.useCallback((key: string) => t(key as Parameters<typeof t>[0]), [t])
  const shortcutOverrides = useUIStore((state) => state.shortcutOverrides)
  const setShortcutOverride = useUIStore((state) => state.setShortcutOverride)
  const clearShortcutOverride = useUIStore((state) => state.clearShortcutOverride)
  const resetAllShortcutOverrides = useUIStore((state) => state.resetAllShortcutOverrides)

  const actions = React.useMemo(() => getCustomizableShortcutActions(), [])
  const actionLabel = React.useCallback(
    (id: string, fallbackLabel: string): string => {
      const key = `settings.openchamber.keyboardShortcuts.action.${id}.label`
      const translated = tUnsafe(key)
      return translated === key ? fallbackLabel : translated
    },
    [tUnsafe],
  )

  const [capturingActionId, setCapturingActionId] = React.useState<string | null>(null)
  const [query, setQuery] = React.useState("")
  const [draftByAction, setDraftByAction] = React.useState<Record<string, ShortcutCombo>>({})
  const [errorText, setErrorText] = React.useState<string>("")
  const [warningText, setWarningText] = React.useState<string>("")
  const [pendingOverwrite, setPendingOverwrite] = React.useState<{
    actionId: string
    combo: ShortcutCombo
    conflictActionId: string
  } | null>(null)

  const visibleActions = actions.filter((action) => {
    const combo = draftByAction[action.id] ?? getEffectiveShortcutCombo(action.id, shortcutOverrides)
    const text = `${actionLabel(action.id, action.label)} ${action.id} ${formatShortcutForDisplay(combo)}`.toLowerCase()
    return query
      .trim()
      .toLowerCase()
      .split(/\s+/)
      .every((word) => text.includes(word))
  })
  const searchLabel = `${t("commandPalette.searchMode.badge")} ${t("settings.openchamber.keyboardShortcuts.title")}`

  const findConflict = React.useCallback(
    (actionId: string, combo: ShortcutCombo): string | null => {
      const normalized = normalizeCombo(combo)
      for (const action of actions) {
        if (action.id === actionId) {
          continue
        }
        const existing = getEffectiveShortcutCombo(action.id, shortcutOverrides)
        if (normalizeCombo(existing) === normalized) {
          return action.id
        }
      }
      return null
    },
    [actions, shortcutOverrides],
  )

  const saveCombo = React.useCallback(
    (actionId: string, combo: ShortcutCombo) => {
      const normalized = normalizeCombo(combo)
      const conflictActionId = findConflict(actionId, normalized)
      if (conflictActionId) {
        setPendingOverwrite({ actionId, combo: normalized, conflictActionId })
        setErrorText("")
        return
      }

      const nextOverrides = { ...shortcutOverrides, [actionId]: normalized }
      setShortcutOverride(actionId, normalized)
      void updateDesktopSettings({ shortcutOverrides: nextOverrides }).catch((error) => {
        console.warn("Failed to persist shortcut override:", error)
      })
      setPendingOverwrite(null)
      setErrorText("")
      setWarningText(
        isRiskyBrowserShortcut(normalized)
          ? t("settings.openchamber.keyboardShortcuts.warning.riskyBrowserShortcut")
          : "",
      )
      setDraftByAction((current) => {
        const rest = { ...current }
        delete rest[actionId]
        return rest
      })
    },
    [findConflict, setShortcutOverride, shortcutOverrides, t],
  )

  const confirmOverwrite = React.useCallback(() => {
    if (!pendingOverwrite) {
      return
    }

    const nextOverrides = {
      ...shortcutOverrides,
      [pendingOverwrite.conflictActionId]: UNASSIGNED_SHORTCUT,
      [pendingOverwrite.actionId]: pendingOverwrite.combo,
    }
    setShortcutOverride(pendingOverwrite.conflictActionId, UNASSIGNED_SHORTCUT)
    setShortcutOverride(pendingOverwrite.actionId, pendingOverwrite.combo)
    void updateDesktopSettings({ shortcutOverrides: nextOverrides }).catch((error) => {
      console.warn("Failed to persist shortcut overwrite:", error)
    })
    setPendingOverwrite(null)
    setErrorText("")
    setWarningText(
      isRiskyBrowserShortcut(pendingOverwrite.combo)
        ? t("settings.openchamber.keyboardShortcuts.warning.riskyBrowserShortcut")
        : "",
    )
    setDraftByAction((current) => {
      const rest = { ...current }
      delete rest[pendingOverwrite.actionId]
      return rest
    })
  }, [pendingOverwrite, setShortcutOverride, shortcutOverrides, t])

  const resetOne = React.useCallback(
    (actionId: string) => {
      const nextOverrides = { ...shortcutOverrides }
      delete nextOverrides[actionId]
      clearShortcutOverride(actionId)
      void updateDesktopSettings({ shortcutOverrides: nextOverrides }).catch((error) => {
        console.warn("Failed to persist shortcut reset:", error)
      })
      setDraftByAction((current) => {
        const rest = { ...current }
        delete rest[actionId]
        return rest
      })
      setPendingOverwrite(null)
      setErrorText("")
      setWarningText("")
    },
    [clearShortcutOverride, shortcutOverrides],
  )

  return (
    <div className="@container/shortcuts mb-8">
      <div className="mb-1 px-1">
        <div className="flex items-center gap-2">
          <h3 className="typography-ui-header font-medium text-foreground">
            {t("settings.openchamber.keyboardShortcuts.title")}
          </h3>
          <Button
            type="button"
            variant="outline"
            size="xs"
            className="!font-normal"
            onClick={() => {
              resetAllShortcutOverrides()
              void updateDesktopSettings({ shortcutOverrides: {} }).catch((error) => {
                console.warn("Failed to persist shortcut reset:", error)
              })
              setDraftByAction({})
              setPendingOverwrite(null)
              setErrorText("")
              setWarningText("")
            }}
          >
            {t("settings.openchamber.keyboardShortcuts.actions.resetAll")}
          </Button>
          <Tooltip>
            <TooltipTrigger asChild>
              <Icon name="information" className="h-3.5 w-3.5 text-muted-foreground cursor-help" />
            </TooltipTrigger>
            <TooltipContent sideOffset={8} className="max-w-xs">
              {t("settings.openchamber.keyboardShortcuts.tooltip")}
            </TooltipContent>
          </Tooltip>
        </div>
      </div>

      {(errorText || warningText || pendingOverwrite) && (
        <div className="mb-2 space-y-2 px-1">
          {pendingOverwrite && (
            <div className="rounded-lg border border-[var(--status-warning-border)] bg-[var(--status-warning-background)] p-3 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <span className="typography-meta text-foreground">
                {t("settings.openchamber.keyboardShortcuts.overwritePrompt")}
              </span>
              <div className="flex gap-2 shrink-0">
                <Button type="button" size="xs" className="!font-normal" onClick={confirmOverwrite}>
                  {t("settings.openchamber.keyboardShortcuts.actions.overwrite")}
                </Button>
                <Button
                  type="button"
                  size="xs"
                  className="!font-normal"
                  variant="ghost"
                  onClick={() => setPendingOverwrite(null)}
                >
                  {t("settings.common.actions.cancel")}
                </Button>
              </div>
            </div>
          )}
          {errorText && (
            <div className="rounded-lg border border-[var(--status-error-border)] bg-[var(--status-error-background)] p-3 typography-meta text-foreground">
              {errorText}
            </div>
          )}
          {warningText && (
            <div className="rounded-lg border border-[var(--status-warning-border)] bg-[var(--status-warning-background)] p-3 typography-meta text-foreground">
              {warningText}
            </div>
          )}
        </div>
      )}

      <div className="flex items-center gap-2 px-2 pb-3">
        <div className="relative min-w-0 flex-1">
          <Icon
            name="search"
            className="pointer-events-none absolute left-2 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground"
          />
          <Input
            aria-label={searchLabel}
            placeholder={searchLabel}
            value={query}
            maxLength={200}
            onChange={(event) => {
              setQuery(event.target.value)
              setCapturingActionId(null)
            }}
            className="h-8 pl-8"
          />
        </div>
        <span
          role="status"
          aria-label={t("settings.openchamber.keyboardShortcuts.title")}
          className="typography-meta shrink-0 tabular-nums text-muted-foreground"
        >
          {visibleActions.length} / {actions.length}
        </span>
        {query && (
          <Button
            type="button"
            size="xs"
            variant="ghost"
            onClick={() => setQuery("")}
            aria-label={t("sidebarFilesTree.search.clearAria")}
          >
            {t("settings.common.actions.clear")}
          </Button>
        )}
      </div>
      <section className="px-2 pb-2 pt-0 space-y-0.5">
        {visibleActions.length === 0 && (
          <p className="py-6 text-center typography-meta text-muted-foreground">{t("search.noResults")}</p>
        )}
        {visibleActions.map((action, index) => {
          const effective = getEffectiveShortcutCombo(action.id, shortcutOverrides)
          const draft = draftByAction[action.id]
          const displayCombo = draft ?? effective
          const hasDraft = typeof draft === "string" && normalizeCombo(draft) !== normalizeCombo(effective)

          return (
            <div
              key={action.id}
              className={cn(
                "flex flex-col gap-2 py-1.5 @2xl/shortcuts:flex-row @2xl/shortcuts:items-center @2xl/shortcuts:gap-8",
                index > 0 && "border-t border-[var(--surface-subtle)]",
              )}
            >
              <div className="flex min-w-0 flex-col @2xl/shortcuts:w-56 shrink-0">
                <span className="typography-ui-label text-foreground">{actionLabel(action.id, action.label)}</span>
              </div>
              <div className="flex min-w-0 flex-1 flex-wrap items-center gap-2 @2xl/shortcuts:w-fit @2xl/shortcuts:flex-initial">
                <Input
                  readOnly
                  aria-label={actionLabel(action.id, action.label)}
                  value={
                    capturingActionId === action.id
                      ? t("settings.openchamber.keyboardShortcuts.field.pressKeys")
                      : formatShortcutForDisplay(displayCombo)
                  }
                  onFocus={() => {
                    setCapturingActionId(action.id)
                    setErrorText("")
                  }}
                  onBlur={() => {
                    if (capturingActionId === action.id) {
                      setCapturingActionId(null)
                    }
                  }}
                  onKeyDown={(event) => {
                    event.preventDefault()
                    event.stopPropagation()

                    if (event.key === "Escape") {
                      setCapturingActionId(null)
                      return
                    }

                    const combo = keyboardEventToCombo(event)
                    if (!combo) {
                      return
                    }

                    setDraftByAction((current) => ({
                      ...current,
                      [action.id]: combo,
                    }))
                    setCapturingActionId(null)
                    setPendingOverwrite(null)
                    setErrorText("")
                  }}
                  className="h-7 w-40 min-w-0 shrink-0 typography-ui-label text-center"
                />
                <Button
                  type="button"
                  variant="secondary"
                  size="xs"
                  className="!font-normal"
                  onClick={() => {
                    const next = draftByAction[action.id]
                    if (!next) {
                      setErrorText(t("settings.openchamber.keyboardShortcuts.error.captureFirst"))
                      return
                    }
                    saveCombo(action.id, next)
                  }}
                  disabled={!hasDraft}
                  aria-label={`${t("settings.common.actions.saveChanges")}: ${actionLabel(action.id, action.label)}`}
                >
                  {t("settings.common.actions.saveChanges")}
                </Button>
                <Button
                  type="button"
                  size="xs"
                  className="!font-normal"
                  variant="ghost"
                  onClick={() => resetOne(action.id)}
                  disabled={!hasDraft && shortcutOverrides[action.id] === undefined}
                  aria-label={`${t("settings.common.actions.reset")}: ${actionLabel(action.id, action.label)}`}
                >
                  {t("settings.common.actions.reset")}
                </Button>
              </div>
            </div>
          )
        })}
      </section>
    </div>
  )
}
