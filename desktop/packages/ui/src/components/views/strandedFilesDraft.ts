import { create } from "zustand"
import type { FileLineEnding } from "./filesViewEditorContent"

/**
 * An unsaved Files buffer left behind when the Files root moved to another project or worktree, or when the editor
 * that held it closed. It is kept outside the editor so it outlives it, until the person saves, discards or reopens
 * the file (C UX-01).
 */
export interface StrandedFilesDraft {
  /** The Files root the file was opened under; reads and writes are scoped to it, not to the directory now shown. */
  root: string
  path: string
  draftContent: string
  /** The editor's view of the file when the draft began (truncated for very large files). */
  displayedContent: string
  /** The file as it was read from disk, with editor line endings, to tell whether it changed on disk since. */
  loadedContent: string
  lineEnding: FileLineEnding
  allowOutsideWorkspace: boolean
}

/** The file's path within its root, for notices. */
export const strandedDraftFileLabel = (draft: StrandedFilesDraft): string => {
  const root = draft.root.replace(/\/+$/, "")
  return draft.path.startsWith(`${root}/`) ? draft.path.slice(root.length + 1) : draft.path
}

interface StrandedFilesDraftState {
  drafts: StrandedFilesDraft[]
  /** Keep a draft; a newer draft of the same file replaces the older one. */
  keep: (draft: StrandedFilesDraft) => void
  /** Drop the draft that was saved or discarded, but not a newer one of the same file kept meanwhile. */
  drop: (draft: StrandedFilesDraft) => void
  /** Take the draft of a file being opened again, so the editor holds it instead of the notice. */
  take: (root: string, path: string) => StrandedFilesDraft | null
}

const sameFile = (draft: StrandedFilesDraft, root: string, path: string): boolean =>
  draft.root === root && draft.path === path

export const useStrandedFilesDraftStore = create<StrandedFilesDraftState>()((set, get) => ({
  drafts: [],
  keep: (draft) =>
    set((state) => ({
      drafts: [...state.drafts.filter((entry) => !sameFile(entry, draft.root, draft.path)), draft],
    })),
  drop: (draft) => set((state) => ({ drafts: state.drafts.filter((entry) => entry !== draft) })),
  take: (root, path) => {
    const draft = get().drafts.find((entry) => sameFile(entry, root, path)) ?? null
    if (draft) get().drop(draft)
    return draft
  },
}))
