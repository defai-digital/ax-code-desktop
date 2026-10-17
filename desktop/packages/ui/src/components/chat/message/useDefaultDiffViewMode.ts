import { useUIStore } from "@/stores/useUIStore"

import type { DiffViewMode } from "./types"

/**
 * The layout a diff preview in chat opens with: the diff layout setting. Dynamic counts as unified here, as in the
 * walkthrough — a preview sits in a column too narrow to split. The preview's own toggle still changes one preview,
 * and a later change of the setting applies to the previews already open as well (the callers' reset effects depend
 * on this value).
 */
export const useDefaultDiffViewMode = (): DiffViewMode =>
  useUIStore((state) => state.diffLayoutPreference) === "side-by-side" ? "side-by-side" : "unified"
