const GIT_BLOB_ID_PATTERN = /^[0-9a-f]{40}(?:[0-9a-f]{24})?$/i

export const normalizeGitBlobId = (value) => {
  if (typeof value !== "string") return null
  const trimmed = value.trim().toLowerCase()
  return GIT_BLOB_ID_PATTERN.test(trimmed) ? trimmed : null
}

export const parseGitStageRecords = (raw) => {
  const entries = new Map()
  for (const record of String(raw || "").split("\0")) {
    if (!record) continue
    const tabIndex = record.indexOf("\t")
    if (tabIndex < 0) continue
    const [mode, objectId, stage] = record.slice(0, tabIndex).split(" ")
    const recordPath = record.slice(tabIndex + 1)
    if (stage !== "0" || !mode || !normalizeGitBlobId(objectId) || !recordPath) continue
    entries.set(recordPath, { id: normalizeGitBlobId(objectId), mode })
  }
  return entries
}

export const parseGitTreeRecords = (raw) => {
  const entries = new Map()
  for (const record of String(raw || "").split("\0")) {
    if (!record) continue
    const tabIndex = record.indexOf("\t")
    if (tabIndex < 0) continue
    const meta = record.slice(0, tabIndex).split(" ")
    const objectId = meta[2]
    const recordPath = record.slice(tabIndex + 1)
    if (!normalizeGitBlobId(objectId) || !recordPath) continue
    entries.set(recordPath, normalizeGitBlobId(objectId))
  }
  return entries
}

export const parseIsBinaryFromNumstat = (raw) => {
  const text = String(raw || "").trim()
  if (!text) {
    return false
  }

  // Expected format: <added>\t<deleted>\t<path>
  const firstLine =
    text
      .split("\n")
      .map((line) => line.trim())
      .find(Boolean) || ""
  const [added, deleted] = firstLine.split("\t")
  return added === "-" || deleted === "-"
}

// `-z` writes every path raw, so non-ASCII names are not C-quoted; a rename or
// copy is three NUL records (status, source, destination) instead of a line.
export const parseGitNameStatusZ = (raw) => {
  const records = String(raw || "").split("\0")
  const entries = []
  for (let index = 0; index < records.length; index += 1) {
    const match = /^([A-Z])\d*$/.exec(records[index])
    if (!match) {
      continue
    }
    const status = match[1]
    if (status === "R" || status === "C") {
      const source = records[index + 1]
      const path = records[index + 2]
      index += 2
      if (source && path) {
        entries.push({ status, source, path })
      }
      continue
    }
    const path = records[index + 1]
    index += 1
    if (path) {
      entries.push({ status, source: null, path })
    }
  }
  return entries
}
