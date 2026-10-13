import path from "node:path"
const asTrimmedString = (value) => (typeof value === "string" ? value.trim() : "")

export const mapCoreFileContentToPlainText = (payload) => {
  if (!payload || typeof payload !== "object") return ""
  if (payload.type === "binary") {
    const error = new Error("Specified path is not a text file")
    error.code = "EISDIR"
    throw error
  }
  return typeof payload.content === "string" ? payload.content : ""
}

export const mapCoreFileContentToRaw = (payload, fallbackMime = "application/octet-stream") => {
  if (!payload || typeof payload !== "object") {
    return { buffer: Buffer.alloc(0), mimeType: fallbackMime }
  }
  const mimeType = typeof payload.mimeType === "string" && payload.mimeType ? payload.mimeType : fallbackMime
  const content = typeof payload.content === "string" ? payload.content : ""
  if (payload.type === "binary" && payload.encoding !== "base64") {
    const error = new Error("Specified path is not a file")
    error.code = "EISDIR"
    throw error
  }
  if (payload.encoding === "base64") {
    return { buffer: Buffer.from(content, "base64"), mimeType }
  }
  return { buffer: Buffer.from(content, "utf8"), mimeType }
}

export const mapCoreFileNodesToDirectoryList = (resolvedPath, nodes) => {
  const entries = Array.isArray(nodes) ? nodes : []
  return {
    directory: resolvedPath,
    entries: entries
      .filter((node) => node && typeof node.name === "string")
      .map((node) => ({
        name: node.name,
        path: typeof node.absolute === "string" && node.absolute.length > 0 ? node.absolute : node.path,
        isDirectory: node.type === "directory",
      })),
  }
}

export const mapCoreFindFilesToSearchEntries = (rootPath, hits, path) => {
  const files = Array.isArray(hits) ? hits : []
  return files
    .filter((relativePath) => typeof relativePath === "string" && relativePath.length > 0)
    .map((relativePath) => {
      const name = path.basename(relativePath)
      return {
        name,
        path: path.join(rootPath, relativePath),
        relativePath: relativePath.split(path.sep).join("/"),
        extension: name.includes(".") ? name.split(".").pop()?.toLowerCase() : undefined,
      }
    })
}

const toPosix = (value) => value.split(path.sep).join("/")

/**
 * The runtime resolves `path` with `path.join(directory, path)`, so it must be relative to the
 * directory the request is scoped to. Desktop routes work in absolute canonical paths; translate
 * them here. A path equal to the directory becomes "." and an absolute path outside the directory
 * is passed through unchanged so the runtime can reject it.
 */
export const toRuntimeRelativePath = (targetPath, directory) => {
  const target = asTrimmedString(targetPath)
  const base = asTrimmedString(directory)
  if (!target || !base || !path.isAbsolute(target) || !path.isAbsolute(base)) return target
  const relative = path.relative(base, target)
  if (relative === "") return "."
  if (relative.startsWith("..") || path.isAbsolute(relative)) return target
  return toPosix(relative)
}

export const createCoreFileAdapter = ({ fetchImpl = fetch, getBaseUrl, getHeaders } = {}) => {
  const requestJson = async (pathname, search, extras = {}) => {
    const base = asTrimmedString(typeof getBaseUrl === "function" ? getBaseUrl() : "")
    if (!base) {
      const error = new Error("AX Code core file API is not ready")
      error.code = "ENOTREADY"
      throw error
    }
    const url = new URL(pathname, base.endsWith("/") ? base : `${base}/`)
    for (const [key, value] of Object.entries(search || {})) {
      if (value === undefined || value === null || value === "") continue
      url.searchParams.set(key, String(value))
    }
    const headers = { ...(typeof getHeaders === "function" ? getHeaders() : {}) }
    const directory = asTrimmedString(extras.directory)
    if (directory) {
      headers["x-ax-code-directory"] = encodeURIComponent(directory)
    }
    const response = await fetchImpl(url, { headers })
    if (!response.ok) {
      const body = await response.json().catch(() => ({}))
      const error = new Error(
        body?.error?.message || body?.message || body?.error || `Core file API ${response.status}`,
      )
      error.status = response.status
      if (response.status === 404) error.code = "ENOENT"
      else if (response.status === 403) error.code = "EACCES"
      throw error
    }
    return response.json()
  }

  return {
    async read({ path: filePath, directory } = {}) {
      const payload = await requestJson(
        "/file/content",
        { path: toRuntimeRelativePath(filePath, directory) },
        { directory },
      )
      return mapCoreFileContentToPlainText(payload)
    },
    async raw({ path: filePath, directory } = {}) {
      const payload = await requestJson(
        "/file/content",
        { path: toRuntimeRelativePath(filePath, directory) },
        { directory },
      )
      return mapCoreFileContentToRaw(payload)
    },
    async list({ path: dirPath, directory } = {}) {
      return requestJson("/file", { path: toRuntimeRelativePath(dirPath, directory) }, { directory })
    },
    async search({ query, directory, limit, type = "file", dirs = false } = {}) {
      return requestJson(
        "/find/file",
        {
          query,
          limit,
          type,
          dirs: dirs ? "true" : "false",
        },
        { directory },
      )
    },
  }
}
