import React from "react"
import type { HookEntry, HookWorkspace } from "@defai-digital/ax-code-sdk/v2"
import { Button } from "@/components/ui/button"
import { Icon } from "@/components/icon/Icon"
import { ViewLoadingSkeleton } from "@/components/ui/ViewLoadingSkeleton"
import { SettingsPageLayout } from "@/components/sections/shared/SettingsPageLayout"
import { SettingsProjectSelector } from "@/components/sections/shared/SettingsProjectSelector"
import { RuntimeAPIContext } from "@/contexts/runtimeAPIContext"
import { useI18n, type I18nKey } from "@/lib/i18n"
import { cn } from "@/lib/utils"
import { useDirectoryStore } from "@/stores/useDirectoryStore"
import { useUIStore } from "@/stores/useUIStore"
import { fetchHookWorkspace } from "./hooksLoad"
import {
  deriveHooksFileStatus,
  deriveHooksTrustNotice,
  hookCommandNeedsExpansion,
  hookMatcherLabel,
  hookSourceLabel,
  hooksLoadErrorMessage,
  type HooksFileStatus,
} from "./hooksModel"

const FILE_STATUS_KEYS: Record<HooksFileStatus, I18nKey> = {
  missing: "settings.hooks.file.status.missing",
  valid: "settings.hooks.file.status.valid",
  invalid: "settings.hooks.file.status.invalid",
}

const TRUST_ENV = "AX_CODE_TRUST_PROJECT_CONFIG=1"

const badgeClass =
  "typography-micro rounded px-1.5 py-0.5 border border-border/50 bg-[var(--surface-muted)] text-muted-foreground"

function EmphasizedTrustText({ text }: { text: string }) {
  const index = text.indexOf(TRUST_ENV)
  if (index < 0) return text
  return (
    <>
      {text.slice(0, index)}
      <code className="font-mono">{TRUST_ENV}</code>
      {text.slice(index + TRUST_ENV.length)}
    </>
  )
}

function sourceText(entry: HookEntry, t: (key: I18nKey) => string): string {
  const source = hookSourceLabel(entry)
  if (source.kind === "project") return t("settings.hooks.list.source.project")
  return source.name || t("settings.hooks.list.source.pack")
}

const HookCommand: React.FC<{ command: string }> = ({ command }) => {
  const { t } = useI18n()
  const [expanded, setExpanded] = React.useState(false)
  const canExpand = hookCommandNeedsExpansion(command)

  return (
    <div className="min-w-0 space-y-1">
      <div className="typography-micro text-muted-foreground">{t("settings.hooks.list.column.command")}</div>
      <code
        className={cn(
          "block font-mono typography-micro text-foreground",
          expanded ? "whitespace-pre-wrap break-all" : "truncate",
        )}
        title={command}
      >
        {command}
      </code>
      {canExpand ? (
        <Button
          type="button"
          size="xs"
          variant="ghost"
          aria-expanded={expanded}
          onClick={() => setExpanded((current) => !current)}
        >
          {expanded ? t("settings.hooks.list.command.collapse") : t("settings.hooks.list.command.expand")}
        </Button>
      ) : null}
    </div>
  )
}

const HooksWorkspaceView: React.FC<{
  workspace: HookWorkspace
  onOpenFile: (path: string) => void
}> = ({ workspace, onOpenFile }) => {
  const { t } = useI18n()
  const notice = deriveHooksTrustNotice(workspace)
  const status = deriveHooksFileStatus(workspace.file)
  const path = workspace.file.path.trim()

  return (
    <div className="space-y-6">
      {notice === "ignored" ? (
        <div
          role="status"
          className="rounded-md border border-[var(--status-warning)]/40 bg-[var(--status-warning)]/10 px-3 py-2 typography-meta text-foreground"
        >
          <EmphasizedTrustText text={t("settings.hooks.trust.ignored")} />
        </div>
      ) : null}
      {notice === "absent" ? (
        <div
          role="status"
          className="rounded-md border border-border bg-[var(--surface-muted)] px-3 py-2 typography-meta text-muted-foreground"
        >
          {t("settings.hooks.trust.absent")}
        </div>
      ) : null}

      <section className="space-y-2">
        <h2 className="typography-ui-label font-semibold text-foreground">{t("settings.hooks.file.heading")}</h2>
        <div className="flex items-start justify-between gap-3 rounded-lg border border-border px-3 py-3">
          <div className="min-w-0 space-y-1">
            {path ? <div className="break-all font-mono typography-micro text-foreground">{path}</div> : null}
            <div className="flex flex-wrap items-center gap-2">
              <span
                className={cn(
                  badgeClass,
                  status === "valid" && "border-[var(--status-success)]/30 text-[var(--status-success)]",
                  status === "invalid" && "border-[var(--status-error)]/30 text-[var(--status-error)]",
                )}
              >
                {t(FILE_STATUS_KEYS[status])}
              </span>
              {status === "invalid" && workspace.file.error ? (
                <span className="typography-micro text-[var(--status-error)]">{workspace.file.error}</span>
              ) : null}
            </div>
          </div>
          {path ? (
            <Button
              type="button"
              size="sm"
              variant="outline"
              aria-label={t("settings.hooks.file.openAria")}
              onClick={() => onOpenFile(path)}
            >
              {t("settings.hooks.file.open")}
            </Button>
          ) : null}
        </div>
      </section>

      <section className="space-y-2">
        <h2 className="typography-ui-label font-semibold text-foreground">{t("settings.hooks.list.heading")}</h2>
        {workspace.hooks.length === 0 ? (
          <p className="typography-ui-label text-muted-foreground">{t("settings.hooks.list.empty")}</p>
        ) : (
          <ul className="divide-y divide-border overflow-hidden rounded-lg border border-border">
            {workspace.hooks.map((entry, index) => {
              const matcher = hookMatcherLabel(entry.matcher)
              return (
                <li key={`${index}:${entry.event}:${entry.source}:${entry.pack ?? ""}`} className="space-y-2 px-3 py-3">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="typography-ui-label font-medium text-foreground">{entry.event}</span>
                    <span className="typography-micro text-muted-foreground">
                      <span className="sr-only">{t("settings.hooks.list.column.matcher")}: </span>
                      {matcher.kind === "all" ? t("settings.hooks.list.matcher.allTools") : matcher.value}
                    </span>
                    {entry.protocol === "claude-code" ? (
                      <span className={badgeClass}>{t("settings.hooks.list.badge.protocol")}</span>
                    ) : null}
                    {entry.blockOnFailure ? (
                      <span
                        className={cn(badgeClass, "border-[var(--status-warning)]/30 text-[var(--status-warning)]")}
                      >
                        {t("settings.hooks.list.badge.blockOnFailure")}
                      </span>
                    ) : null}
                    <span className={badgeClass}>{sourceText(entry, t)}</span>
                  </div>
                  <HookCommand command={entry.command} />
                </li>
              )
            })}
          </ul>
        )}
      </section>

      <section className="space-y-2">
        <h2 className="typography-ui-label font-semibold text-foreground">{t("settings.hooks.packs.heading")}</h2>
        <p className="typography-meta text-muted-foreground">{t("settings.hooks.packs.description")}</p>
        {workspace.packs.length === 0 ? (
          <p className="typography-ui-label text-muted-foreground">{t("settings.hooks.packs.empty")}</p>
        ) : (
          <ul className="divide-y divide-border overflow-hidden rounded-lg border border-border">
            {workspace.packs.map((pack) => (
              <li key={pack.name} className="space-y-1 px-3 py-3">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="typography-ui-label font-medium text-foreground">{pack.name}</span>
                  <span
                    className={cn(
                      badgeClass,
                      pack.enabled && "border-[var(--status-success)]/30 text-[var(--status-success)]",
                    )}
                  >
                    {pack.enabled ? t("settings.hooks.packs.enabled") : t("settings.hooks.packs.disabled")}
                  </span>
                </div>
                {pack.description ? <p className="typography-meta text-muted-foreground">{pack.description}</p> : null}
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  )
}

export const HooksPage: React.FC = () => {
  const { t } = useI18n()
  const runtime = React.useContext(RuntimeAPIContext)
  // SettingsProjectSelector writes the active project here, the same directory MCP reads.
  const currentDirectory = useDirectoryStore((state) => state.currentDirectory)
  const directory = currentDirectory.trim()
  const [workspace, setWorkspace] = React.useState<HookWorkspace | null>(null)
  const [loading, setLoading] = React.useState(directory.length > 0)
  const [error, setError] = React.useState<string | null>(null)
  const requestRef = React.useRef(0)

  const load = React.useCallback((nextDirectory: string, mode: "replace" | "refresh") => {
    const requestId = ++requestRef.current
    if (mode === "replace") setWorkspace(null)
    setError(null)
    setLoading(true)
    void fetchHookWorkspace(nextDirectory).then(
      (next) => {
        if (requestId !== requestRef.current) return
        setWorkspace(next)
        setError(null)
        setLoading(false)
      },
      (reason: unknown) => {
        if (requestId !== requestRef.current) return
        if (mode === "replace") setWorkspace(null)
        setError(hooksLoadErrorMessage(reason))
        setLoading(false)
      },
    )
  }, [])

  React.useEffect(() => {
    if (!directory) {
      requestRef.current += 1
      setWorkspace(null)
      setError(null)
      setLoading(false)
      return
    }
    load(directory, "replace")
  }, [directory, load])

  const openFile = React.useCallback(
    (path: string) => {
      if (!directory || !path) return
      const editor = runtime?.editor
      if (editor) {
        void editor.openFile(path)
        return
      }
      useUIStore.getState().openContextFile(directory, path)
    },
    [directory, runtime],
  )

  const retry = () => {
    if (!directory || loading) return
    load(directory, workspace ? "refresh" : "replace")
  }

  const showSkeleton = Boolean(directory) && loading && !workspace
  const showError = error !== null && !showSkeleton

  return (
    <SettingsPageLayout>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0 space-y-1">
          <h1 className="typography-ui-header font-semibold text-foreground">{t("settings.page.hooks.title")}</h1>
          <p className="typography-ui-label text-muted-foreground">{t("settings.hooks.page.description")}</p>
        </div>
        <Button
          type="button"
          size="sm"
          variant="outline"
          aria-label={t("settings.hooks.page.refreshAria")}
          disabled={!directory || loading}
          onClick={() => {
            if (!directory || loading) return
            load(directory, workspace ? "refresh" : "replace")
          }}
        >
          <Icon name="refresh" className={cn("h-4 w-4", loading && "animate-spin")} />
          {t("settings.hooks.page.refresh")}
        </Button>
      </div>

      <SettingsProjectSelector />

      {!directory ? (
        <p className="typography-ui-label text-muted-foreground">{t("settings.hooks.page.noDirectory")}</p>
      ) : null}

      {showSkeleton ? <ViewLoadingSkeleton label={t("settings.hooks.page.loading")} /> : null}

      {showError ? (
        <div role="alert" className="space-y-3 rounded-lg border border-border px-3 py-3">
          <p className="typography-ui-label text-foreground">{t("settings.hooks.page.error")}</p>
          {error ? <p className="typography-micro text-muted-foreground">{error}</p> : null}
          <Button type="button" size="sm" variant="outline" onClick={retry} disabled={loading}>
            {t("settings.hooks.page.retry")}
          </Button>
        </div>
      ) : null}

      {workspace ? <HooksWorkspaceView key={directory} workspace={workspace} onOpenFile={openFile} /> : null}
    </SettingsPageLayout>
  )
}
