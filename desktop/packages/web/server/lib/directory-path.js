export const createDirectoryPathNormalizer = (os, path) => (value) => {
  if (typeof value !== "string") return value
  if (!value.trim()) return ""
  if (value === "~") return os.homedir()
  if (value.startsWith("~/") || value.startsWith("~\\")) return path.join(os.homedir(), value.slice(2))
  return value
}
