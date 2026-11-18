import { normalizeProjectPath, projectPathMatchesRoot } from "@/lib/projectResolution"

import { normalizeFilesViewPath } from "@/lib/filesViewPath"

export const getContextPanelRelativePathLabel = (filePath: string | null, directory: string): string => {
  const normalizedFile = normalizeFilesViewPath(filePath ?? "")
  if (!normalizedFile) {
    return ""
  }

  const normalizedDir = normalizeProjectPath(directory)
  if (!normalizedDir || !projectPathMatchesRoot(normalizedFile, normalizedDir) || normalizedFile === normalizedDir) {
    return normalizedFile
  }

  const relative = normalizedFile.slice(normalizedDir.length)
  return relative.startsWith("/") ? relative.slice(1) : relative
}
