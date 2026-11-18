// Desktop accepts numeric shorthand and opaque hyphenated build suffixes in addition to release versions.
const VERSION_PATTERN = /^(\d+(?:\.\d+)+)(?:-([0-9A-Za-z-]+(?:\.[0-9A-Za-z-]+)*))?(?:\+[0-9A-Za-z-]+(?:\.[0-9A-Za-z-]+)*)?$/
const PRERELEASE_PATTERN = /^(alpha|beta|rc|pre|preview|next)(?:[.-]|\d|$)/i

export function parseAxCodeVersion(value) {
  if (typeof value !== "string") return null
  const version = value.trim().replace(/^v/, "")
  const match = VERSION_PATTERN.exec(version)
  if (!match) return null
  const parts = match[1].split(".").map(Number)
  if (!parts.every(Number.isSafeInteger)) return null
  return { version, parts, prerelease: PRERELEASE_PATTERN.test(match[2] ?? "") }
}

/** Return null when either value is unknown. The order is used for capability thresholds. */
export function compareAxCodeVersions(left, right) {
  const a = parseAxCodeVersion(left)
  const b = parseAxCodeVersion(right)
  if (!a || !b) return null

  const length = Math.max(a.parts.length, b.parts.length)
  for (let index = 0; index < length; index += 1) {
    const delta = (a.parts[index] ?? 0) - (b.parts[index] ?? 0)
    if (delta !== 0) return delta
  }
  return Number(b.prerelease) - Number(a.prerelease)
}
