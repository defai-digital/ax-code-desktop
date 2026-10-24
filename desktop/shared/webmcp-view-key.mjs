/** Lexical absolute-path identity shared by Electron and the renderer; no filesystem access.
 * @param {unknown} directory
 * @returns {string}
 */
export function projectKeyFor(directory) {
  // Session-shaped data can arrive before its directory resolves. Treat a
  // missing directory as the empty project key instead of throwing while a
  // titlebar or sidebar renders runtime-derived rows.
  let value = typeof directory === "string" ? directory.replace(/\\/g, "/") : ""
  const windows = /^[a-z]:\//i.test(value) || value.startsWith("//")
  if (windows) value = value.toLowerCase()
  const drive = value.match(/^[a-z]:\//)?.[0] ?? ""
  const prefix = drive || (value.startsWith("//") ? "//" : value.startsWith("/") ? "/" : "")
  const parts = []
  const floor = prefix === "//" ? 2 : 0
  for (const part of value.slice(prefix.length).split("/")) {
    if (!part || part === ".") continue
    if (part === "..") {
      if (parts.length > floor) parts.pop()
    } else parts.push(part)
  }
  return prefix + parts.join("/")
}

/**
 * @param {unknown} directory
 * @param {unknown} [sessionID]
 * @returns {string}
 */
export function viewKeyFor(directory, sessionID) {
  return `${projectKeyFor(directory)}\0${sessionID ?? "draft"}`
}
