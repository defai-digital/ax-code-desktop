import { getProjectPathIdentityKey } from "@/lib/projectResolution"
import { normalizePathSeparators, readDirectoryPath } from "@/lib/pathValues"

export const normalizeDirectoryExplorerProjectPathKey = (value?: string | null): string | null => {
  return getProjectPathIdentityKey(value)
}

export const ensureBrowseDirectoryPath = (value: string): string => {
  const directory = readDirectoryPath(value)
  if (!directory) return ""
  return directory.endsWith("/") ? directory : `${directory}/`
}

export const normalizeDirectoryExplorerHome = (value: unknown): string | null => {
  const home = readDirectoryPath(value)
  return home ? normalizePathSeparators(home) : null
}
