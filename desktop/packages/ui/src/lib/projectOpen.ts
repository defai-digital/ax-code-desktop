import type { I18nKey } from "@/lib/i18n"
import {
  DIRECTORY_SELECTION_CANCELLED,
  isDesktopLocalOriginActive,
  isTauriShell,
  requestDirectoryAccess,
  startAccessingDirectory,
} from "@/lib/desktop"
import { sessionEvents } from "@/lib/sessionEvents"
import { toast } from "@/components/ui"
import { useProjectsStore } from "@/stores/useProjectsStore"
import { useDirectoryStore } from "@/stores/useDirectoryStore"
import { useUIStore } from "@/stores/useUIStore"
import { useSessionUIStore } from "@/sync/session-ui-store"

export type OpenProjectFolderOutcome = "added" | "cancelled" | "dialog" | "failed"

type Translate = (key: I18nKey, params?: Record<string, string | number>) => string

/** True when the native OS folder picker is available to this renderer. */
export const canUseNativeFolderPicker = (): boolean => isTauriShell() && isDesktopLocalOriginActive()

/**
 * The one "open a folder" path shared by the home screen, the sidebar, the
 * command palette, the app menu and the composer.
 *
 * On the desktop app it opens the OS folder picker directly, registers the
 * folder as a project and lands in a new session draft for it. Anywhere else
 * it falls back to the in-app directory dialog, which also hosts cloning and
 * typed paths.
 */
export async function openProjectFolder({ t }: { t: Translate }): Promise<OpenProjectFolderOutcome> {
  if (!canUseNativeFolderPicker()) {
    sessionEvents.requestDirectoryDialog()
    return "dialog"
  }

  const homeDirectory = useDirectoryStore.getState().homeDirectory ?? ""
  let selected: { success: boolean; path?: string; error?: string }
  try {
    selected = await requestDirectoryAccess(homeDirectory, { title: t("directoryExplorerDialog.title") })
  } catch (error) {
    toast.error(t("directoryExplorerDialog.toast.failedToSelectDirectory"), {
      description: error instanceof Error ? error.message : t("directoryExplorerDialog.toast.unknownError"),
    })
    return "failed"
  }
  if (!selected.success || !selected.path) {
    if (selected.error && selected.error !== DIRECTORY_SELECTION_CANCELLED) {
      toast.error(t("directoryExplorerDialog.toast.failedToSelectDirectory"), { description: selected.error })
      return "failed"
    }
    return "cancelled"
  }

  const access = await startAccessingDirectory(selected.path)
  if (!access.success) {
    toast.error(t("directoryExplorerDialog.toast.failedToOpenDirectory"), {
      description: access.error || t("directoryExplorerDialog.toast.desktopCouldNotGrantAccess"),
    })
    return "failed"
  }

  return startWorkInProject(selected.path, { t })
}

/**
 * Registers (or re-activates) a project folder and opens a draft session in
 * it with the chat tab active, so the user can type immediately.
 */
export function startWorkInProject(path: string, { t }: { t: Translate }): OpenProjectFolderOutcome {
  const entry = useProjectsStore.getState().addProject(path)
  if (!entry) {
    toast.error(t("directoryExplorerDialog.toast.failedToAddProject"), {
      description: t("directoryExplorerDialog.toast.selectValidDirectoryPath"),
    })
    return "failed"
  }
  useUIStore.getState().setActiveMainTab("chat")
  useSessionUIStore.getState().openNewSessionDraft({ directoryOverride: entry.path })
  return "added"
}
