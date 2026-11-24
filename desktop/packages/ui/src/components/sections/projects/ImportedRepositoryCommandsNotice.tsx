import React from "react"
import { Button } from "@/components/ui/button"
import { toast } from "@/components/ui"
import {
  acceptImportedRepositoryCommands,
  discardImportedRepositoryCommands,
  getImportedRepositoryCommands,
  type ImportedRepositoryCommands,
  type OpenChamberProjectAction,
  type ProjectRef,
} from "@/lib/openchamberConfig"
import {
  normalizeManualOpenUrl,
  normalizeProjectActionCommand,
  PROJECT_ACTIONS_UPDATED_EVENT,
  revealInvisibleCharacters,
} from "@/lib/projectActions"
import { dispatchProjectScopedEvent } from "@/lib/projectScopedEvents"
import { useI18n } from "@/lib/i18n"
import { isCurrentProjectOperationTarget } from "./projectOperationTarget"

interface ImportedRepositoryCommandsNoticeProps {
  projectRef: ProjectRef
  /**
   * Called after the held commands were added, with the project they were saved to, so the sections that show that
   * project's live settings can reload. The selection may have moved on by then.
   */
  onAdded: (project: ProjectRef) => void
}

/**
 * Shows, in full, the commands a repository's legacy project file carried, and lets the person add or discard them.
 * Until then they do not run: worktree creation and the header actions read only the saved settings. The buttons act
 * on the stored snapshot shown here, never on the repository file. Mount it keyed by project, so a pending answer for
 * one project cannot leave another project's notice disabled.
 */
export function ImportedRepositoryCommandsNotice(props: ImportedRepositoryCommandsNoticeProps): React.ReactNode {
  const { projectRef, onAdded } = props
  const { t } = useI18n()
  const [held, setHeld] = React.useState<ImportedRepositoryCommands | null>(null)
  const [busy, setBusy] = React.useState(false)
  const projectRefRef = React.useRef(projectRef)
  projectRefRef.current = projectRef

  const load = React.useCallback(() => {
    let cancelled = false
    getImportedRepositoryCommands(projectRef)
      .then((value) => {
        if (!cancelled) setHeld(value)
      })
      .catch(() => {
        if (!cancelled) setHeld(null)
      })
    return () => {
      cancelled = true
    }
  }, [projectRef])

  React.useEffect(() => load(), [load])

  const resolve = React.useCallback(
    async (mode: "add" | "discard") => {
      const shown = held
      if (!shown) return
      const target = projectRefRef.current
      setBusy(true)
      try {
        const result =
          mode === "add"
            ? await acceptImportedRepositoryCommands(target, shown)
            : await discardImportedRepositoryCommands(target, shown)
        // The header listens per project, so it hears about the saved project even if Settings moved on.
        if (result === "done" && mode === "add") {
          dispatchProjectScopedEvent(PROJECT_ACTIONS_UPDATED_EVENT, target.id)
          onAdded(target)
        }
        if (!isCurrentProjectOperationTarget(target, projectRefRef.current)) return
        if (result === "failed") {
          toast.error(t("settings.projects.imported.toast.failed"))
          return
        }
        if (result === "changed") {
          // What is stored is no longer what was on screen: show it again instead of acting on it.
          toast.error(t("settings.projects.imported.toast.changed"))
          load()
          return
        }
        setHeld(null)
        toast.success(
          mode === "add" ? t("settings.projects.imported.toast.added") : t("settings.projects.imported.toast.discarded"),
        )
      } catch {
        if (isCurrentProjectOperationTarget(target, projectRefRef.current)) {
          toast.error(t("settings.projects.imported.toast.failed"))
        }
      } finally {
        setBusy(false)
      }
    },
    [held, load, onAdded, t],
  )

  if (!held) return null

  return (
    <section
      aria-labelledby="imported-repository-commands-title"
      className="mb-6 rounded-lg border border-[var(--status-warning-border)] bg-[var(--status-warning-background)] p-3"
    >
      <h3 id="imported-repository-commands-title" className="typography-ui-header font-medium text-foreground">
        {t("settings.projects.imported.title")}
      </h3>
      <p className="typography-meta mt-1 text-muted-foreground">{t("settings.projects.imported.description")}</p>

      {held.setupCommands.length > 0 && (
        <div className="mt-3">
          <h4 className="typography-ui-label font-medium text-foreground">{t("settings.projects.imported.setupTitle")}</h4>
          <p className="typography-meta text-muted-foreground">{t("settings.projects.imported.setupDescription")}</p>
          <ol className="mt-1 space-y-1">
            {held.setupCommands.map((command, index) => (
              <li key={`${index}:${command}`}>
                <CommandText value={command} />
              </li>
            ))}
          </ol>
        </div>
      )}

      {held.actions.length > 0 && (
        <div className="mt-3">
          <h4 className="typography-ui-label font-medium text-foreground">{t("settings.projects.actions.title")}</h4>
          <ul className="mt-1 space-y-2">
            {held.actions.map((action) => (
              <li key={action.id}>
                <div className="typography-ui-label text-foreground">{action.name}</div>
                {/* What the launcher types into the terminal, not the stored text. */}
                <CommandText value={normalizeProjectActionCommand(action.command)} />
                <ActionUrlLine action={action} />
              </li>
            ))}
          </ul>
        </div>
      )}

      <div className="mt-3 flex flex-wrap gap-2">
        <Button size="xs" className="!font-normal" disabled={busy} onClick={() => void resolve("add")}>
          {t("settings.projects.imported.actions.add")}
        </Button>
        <Button size="xs" variant="outline" className="!font-normal" disabled={busy} onClick={() => void resolve("discard")}>
          {t("settings.projects.imported.actions.discard")}
        </Button>
      </div>
    </section>
  )
}

/** Left-to-right and isolated, with invisible and reordering characters written out. */
function CommandText(props: { value: string }): React.ReactNode {
  return (
    <code
      dir="ltr"
      className="typography-code block whitespace-pre-wrap break-all rounded bg-background px-2 py-1 text-foreground [unicode-bidi:isolate]"
    >
      {revealInvisibleCharacters(props.value)}
    </code>
  )
}

/**
 * Says what URL the action opens and when, the way ProjectActionsButton runs it: nothing opens without autoOpenUrl;
 * with it, a configured URL opens at start (or once it appears in the output), an unusable one opens nothing, and with
 * no URL the first one the command prints opens.
 */
function ActionUrlLine(props: { action: OpenChamberProjectAction }): React.ReactNode {
  const { t } = useI18n()
  const { action } = props
  if (!action.autoOpenUrl) return null
  const raw = (action.openUrl ?? "").trim()
  const configured = raw ? normalizeManualOpenUrl(raw) : null
  let line = t("settings.projects.imported.opensOutputUrl")
  if (raw && !configured) {
    line = t("settings.projects.imported.invalidUrl", { url: revealInvisibleCharacters(raw) })
  } else if (configured) {
    const url = revealInvisibleCharacters(configured)
    line = action.waitForUrl
      ? t("settings.projects.imported.opensUrlWhenReady", { url })
      : t("settings.projects.imported.opensUrl", { url })
  }
  return (
    <div dir="ltr" className="typography-meta break-all text-muted-foreground [unicode-bidi:isolate]">
      {line}
    </div>
  )
}
