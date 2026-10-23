import { useDirectoryStore } from "@/stores/useDirectoryStore"
import { useProjectsStore } from "@/stores/useProjectsStore"
import { getActiveConfigDirectory } from "@/stores/utils/configDirectory"

/** Keep settings forms on the same project scope used by their configuration store. */
export const useActiveConfigDirectory = (): string | null => {
  // The resolver reads store state through getState(), which React Compiler cannot
  // track; memoizing its result would freeze the directory at first render and
  // break project switching, so this hook must stay unmemoized.
  "use no memo"
  useProjectsStore((state) => state.getActiveProject()?.path)
  // The client directory is the resolver's fallback when no project is selected.
  useDirectoryStore((state) => state.currentDirectory)
  return getActiveConfigDirectory("Settings")
}
