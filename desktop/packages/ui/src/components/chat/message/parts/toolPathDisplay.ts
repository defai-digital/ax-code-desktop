import { normalizeProjectPath, projectPathMatchesRoot } from "@/lib/projectResolution"

export const normalizeToolDisplayPath = (value: string): string => normalizeProjectPath(value) ?? ""

const pathsEqual = (left: string, right: string): boolean =>
  projectPathMatchesRoot(left, right) && projectPathMatchesRoot(right, left)

const toComparablePath = (value: string): string =>
  value.startsWith("//") || /^[A-Za-z]:\//.test(value) ? value.toLowerCase() : value

export const getToolRelativePath = (path: string, currentDirectory: string): string => {
  const normalizedPath = normalizeToolDisplayPath(path)
  const normalizedCurrentDirectory = normalizeToolDisplayPath(currentDirectory)

  if (!normalizedPath) {
    return ""
  }

  if (!normalizedCurrentDirectory) {
    return normalizedPath
  }

  if (pathsEqual(normalizedPath, normalizedCurrentDirectory)) {
    return "."
  }

  if (!projectPathMatchesRoot(normalizedPath, normalizedCurrentDirectory)) {
    return normalizedPath
  }

  const comparablePath = toComparablePath(normalizedPath)
  const comparableDirectory = toComparablePath(normalizedCurrentDirectory)
  const relative = normalizedPath.slice(comparableDirectory.length)
  if (comparablePath === comparableDirectory) {
    return "."
  }
  return relative.startsWith("/") ? relative.slice(1) : relative
}

const isAbsoluteToolPath = (normalizedPath: string): boolean =>
  normalizedPath.startsWith("/") || /^[A-Za-z]:\//.test(normalizedPath)

/**
 * `filePath` as the editor's API wants it: the path itself when it already names a location — a POSIX root, a
 * UNC share, or a Windows drive — and otherwise joined to the directory the tool ran in. Testing only for a
 * leading `/` prefixed a drive path with the directory, so a click asked the editor to open
 * `C:/repo/C:/repo/src/app.ts`.
 */
export const toAbsoluteToolPath = (currentDirectory: string, filePath: string): string => {
  // A POSIX absolute path is handed over exactly as the tool wrote it: a backslash is a legal filename character
  // there, so normalizing it names a different file. A Windows drive path is normalized instead, where a backslash
  // is a separator and the callers pass the result to the OS.
  if (filePath.startsWith("/")) {
    return filePath
  }
  if (/^[A-Za-z]:[\\/]/.test(filePath)) {
    return normalizeToolDisplayPath(filePath)
  }

  const normalizedPath = normalizeToolDisplayPath(filePath)
  if (!normalizedPath) {
    return ""
  }
  if (isAbsoluteToolPath(normalizedPath)) {
    return normalizedPath
  }
  const normalizedDirectory = normalizeToolDisplayPath(currentDirectory)
  if (!normalizedDirectory) {
    return normalizedPath
  }
  return normalizedDirectory.endsWith("/")
    ? `${normalizedDirectory}${normalizedPath}`
    : `${normalizedDirectory}/${normalizedPath}`
}
