import { normalizeProjectPath } from "../../../../../shared/path-values.mjs"

export const createProjectIdFromPath = (projectPath) => {
  const normalized = normalizeProjectPath(projectPath)
  if (!normalized) {
    return ""
  }

  return `path_${Buffer.from(normalized, "utf8").toString("base64url")}`
}
