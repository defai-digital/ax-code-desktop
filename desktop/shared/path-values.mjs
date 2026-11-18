// Only explicitly Windows-shaped paths use backslashes as separators. A
// backslash in an absolute POSIX path is part of the actual file name.
export const normalizePathSeparators = (value, directory = "") => {
  const windowsPath = /^(?:[A-Za-z]:|\\\\)/.test(value)
  const windowsRelative = !value.startsWith("/") && /^(?:[A-Za-z]:|\\\\|\/\/)/.test(directory)
  return windowsPath || windowsRelative ? value.replace(/\\/g, "/") : value
}

export const readLiteralPath = (value) =>
  typeof value === "string" && value.trim().length > 0 ? value : null

export const readDirectoryPath = readLiteralPath

export const normalizeProjectPath = (value) => {
  const literal = readDirectoryPath(value)
  if (!literal) return null
  const normalized = normalizePathSeparators(literal).replace(/^([a-z]):/, (_, letter) => letter.toUpperCase() + ":")
  if (/^\/+$/.test(normalized)) return "/"
  const driveRoot = normalized.match(/^([A-Z]:)\/+$/)
  if (driveRoot) return `${driveRoot[1]}/`
  if (/^[A-Z]:$/.test(normalized)) return `${normalized}/`
  return normalized.length > 1 ? normalized.replace(/\/+$/, "") : normalized
}

export const expandHomePath = (value, home) => {
  if (!home) return value
  if (value === "~") return home
  if (value.startsWith("~/") || value.startsWith("~\\")) {
    return `${normalizePathSeparators(home).replace(/\/+$/, "")}/${normalizePathSeparators(value.slice(2), home)}`
  }
  return value
}

export const readPathOutput = (raw, platform) => {
  const value = String(raw ?? "")
  if (platform === "win32" && value.endsWith("\r\n")) return value.slice(0, -2)
  return value.endsWith("\n") ? value.slice(0, -1) : value
}
