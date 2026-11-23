import React from "react"
import { toast } from "@/components/ui"
import { Button } from "@/components/ui/button"
import { copyTextToClipboard } from "@/lib/clipboard"
import { useI18n } from "@/lib/i18n"
import type { FilesAPI } from "@/lib/api/types"
import { normalizeEditorLineEndings } from "./filesViewEditorContent"
import { saveFilesViewDraft, waitForFilesViewWrites } from "./filesViewEditorSave"
import { strandedDraftFileLabel, useStrandedFilesDraftStore, type StrandedFilesDraft } from "./strandedFilesDraft"

interface StrandedFilesDraftBannerProps {
  readFile: FilesAPI["readFile"]
  writeFile: FilesAPI["writeFile"]
}

const trimSlash = (value: string): string => value.replace(/\/+$/, "")

const rootName = (draft: StrandedFilesDraft): string => {
  const root = trimSlash(draft.root)
  return root.slice(root.lastIndexOf("/") + 1) || root
}

type DiskCheck = "unchanged" | "already-saved" | "changed"

/**
 * Unsaved Files edits that were open when the session moved to another project or worktree, or when their editor
 * closed. They stay here until the person saves them to the file they came from, copies them, or discards them; a
 * file that changed on disk since is never overwritten from here (C UX-01).
 */
export function StrandedFilesDraftBanner(props: StrandedFilesDraftBannerProps): React.ReactNode {
  const { readFile, writeFile } = props
  const { t } = useI18n()
  const drafts = useStrandedFilesDraftStore((state) => state.drafts)
  const drop = useStrandedFilesDraftStore((state) => state.drop)
  const [saving, setSaving] = React.useState<StrandedFilesDraft | null>(null)

  const checkDisk = async (draft: StrandedFilesDraft): Promise<DiskCheck> => {
    // An autosave of this file may still be in flight; the check has to see where it landed.
    await waitForFilesViewWrites(draft.path)
    if (typeof readFile !== "function") return "changed"
    try {
      const { content } = await readFile(draft.path, {
        allowOutsideWorkspace: draft.allowOutsideWorkspace,
        directory: draft.root,
      })
      const disk = normalizeEditorLineEndings(content)
      if (disk === draft.draftContent) return "already-saved"
      return disk === draft.loadedContent ? "unchanged" : "changed"
    } catch {
      // Moved, deleted or unreadable: nothing to compare against, so nothing is written.
      return "changed"
    }
  }

  const save = async (draft: StrandedFilesDraft) => {
    setSaving(draft)
    try {
      const disk = await checkDisk(draft)
      if (disk === "changed") {
        toast.error(t("filesView.stranded.conflict", { file: strandedDraftFileLabel(draft) }))
        return
      }
      // Opening the file again meanwhile took the draft back into its editor, which now owns it and saves it itself.
      if (!useStrandedFilesDraftStore.getState().drafts.includes(draft)) return
      if (disk === "unchanged") {
        const result = await saveFilesViewDraft({
          path: draft.path,
          draftContent: draft.draftContent,
          displayedContent: draft.displayedContent,
          lineEnding: draft.lineEnding,
          writeFile,
          options: { allowOutsideWorkspace: draft.allowOutsideWorkspace, directory: draft.root },
        })
        if (!result.ok) {
          toast.error(
            result.reason === "unsupported"
              ? t("filesView.toast.savingNotSupported")
              : t("filesView.toast.writeFileFailed"),
          )
          return
        }
      }
      toast.success(t("filesView.stranded.saved", { file: strandedDraftFileLabel(draft) }))
      drop(draft)
    } catch (error) {
      toast.error(error instanceof Error ? error.message : t("filesView.toast.saveFailed"))
    } finally {
      setSaving(null)
    }
  }

  const copy = async (draft: StrandedFilesDraft) => {
    const result = await copyTextToClipboard(draft.draftContent)
    if (result.ok) toast.success(t("filesView.stranded.copied"))
    else toast.error(t("filesView.toast.copyFailed"))
  }

  if (drafts.length === 0) return null

  return (
    <div
      role="status"
      className="flex flex-col gap-1 border-b border-[var(--status-warning-border)] bg-[var(--status-warning-background)] px-3 py-2"
    >
      {drafts.map((draft) => (
        <div key={`${draft.root}\u0000${draft.path}`} className="flex flex-wrap items-center gap-2">
          <span className="typography-ui-label min-w-0 flex-1 text-foreground">
            {t("filesView.stranded.message", { file: strandedDraftFileLabel(draft), project: rootName(draft) })}
          </span>
          <Button size="sm" variant="outline" disabled={saving !== null} onClick={() => void save(draft)}>
            {t("filesView.unsaved.saveChanges")}
          </Button>
          <Button size="sm" variant="ghost" onClick={() => void copy(draft)}>
            {t("filesView.stranded.copy")}
          </Button>
          <Button size="sm" variant="ghost" disabled={saving !== null} onClick={() => drop(draft)}>
            {t("filesView.unsaved.discard")}
          </Button>
        </div>
      ))}
    </div>
  )
}
