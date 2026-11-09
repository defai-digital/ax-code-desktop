/** Compact a display path without making registered sibling directories indistinguishable. */
export function compactProjectPath(path: string, peers: readonly string[]): string {
  const segments = path.replace(/\\/g, "/").split("/").filter(Boolean)
  if (segments.length <= 2) return path
  let count = 2
  while (count < segments.length) {
    const suffix = segments.slice(-count).join("/")
    const collision = peers.some((peer) => peer !== path && peer.replace(/\\/g, "/").endsWith(`/${suffix}`))
    if (!collision) return `…/${suffix}`
    count += 1
  }
  return path
}

/** Preserve project names, shortening only a path supplied as visible context. */
export function compactProjectContext(label: string, peers: readonly string[]): string {
  const separator = label.lastIndexOf(" · ")
  const path = separator >= 0 ? label.slice(separator + 3) : label
  if (!/^(?:\/|~\/|[A-Za-z]:[\\/])/.test(path)) return label
  const compact = compactProjectPath(path, peers)
  return separator >= 0 ? `${label.slice(0, separator)} · ${compact}` : compact
}
