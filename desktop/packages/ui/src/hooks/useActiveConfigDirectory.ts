import { useDirectoryStore } from "@/stores/useDirectoryStore"
import { useProjectsStore } from "@/stores/useProjectsStore"
import { getActiveConfigDirectory } from "@/stores/utils/configDirectory"

/** Keep settings forms on the same project scope used by their configuration store. */
export const useActiveConfigDirectory = (): string | null => {
  useProjectsStore((state) => state.getActiveProject()?.path)
  // The client directory is the resolver's fallback when no project is selected.
  useDirectoryStore((state) => state.currentDirectory)
  return getActiveConfigDirectory("Settings")
}
