/** Lexical absolute-path identity shared by Electron and the renderer; no filesystem access. */
export function projectKeyFor(directory) {
  let value = directory.replace(/\\/g, "/")
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

export function viewKeyFor(directory, sessionID) {
  return `${projectKeyFor(directory)}\0${sessionID ?? "draft"}`
}
