import { createAtomicJsonWriter, parseJsonObject } from "../../../../../shared/json-file.cjs"

const MAX_BODY_BYTES = 4 * 1024 * 1024

const emptySnapshot = () => ({ version: 1, foldersMap: {}, collapsedFolderIds: [], updatedAt: 0, revision: 0 })

// The file's write counter. A missing or malformed one reads as 0, which is what a file written before
// revisions existed holds.
const readRevision = (snapshot) =>
  Number.isSafeInteger(snapshot?.revision) && snapshot.revision >= 0 ? snapshot.revision : 0

export const registerSessionFoldersRoutes = (app, dependencies) => {
  const { fsPromises, path, openchamberDataDir, now = () => Date.now() } = dependencies

  const filePath = path.join(openchamberDataDir, "sessions-directories.json")

  const writeJsonFile = createAtomicJsonWriter({ filesystem: fsPromises })

  const readSnapshot = async ({ recoverCorrupt = false } = {}) => {
    const raw = await fsPromises.readFile(filePath, "utf8").catch((error) => {
      if (error && error.code === "ENOENT") return null
      throw error
    })
    if (raw === null) return null
    try {
      return parseJsonObject(raw, "Session folders")
    } catch (error) {
      // An explicit save may recover malformed JSON, but a filesystem read
      // failure must propagate: replacing an unread snapshot could erase it.
      if (recoverCorrupt) return null
      throw error
    }
  }

  // POST bodies are full client snapshots. Every window loads the disk state
  // once at boot and then writes its own whole map, so the merge has to keep a
  // folder another window created after this writer booted (the writer never
  // knew it) while still letting a deletion or an un-collapse persist — the
  // previous per-id union did neither: it resurrected every deleted folder on
  // the very next write, even from the single window that deleted it.
  //
  // Revisions: a client that read the file at revision N sends `baseRevision: N`. If the file is still at N
  // the snapshot is authoritative and the file moves to N + 1; otherwise the write is refused with 409 and the
  // current file, and the client merges its own changes into it and writes again. That is what lets two open
  // windows keep each other's renames, creations and deletions. A write without `baseRevision` (an older
  // client, or the unload flush that cannot read a response) still goes through the timestamp merge below.
  //
  // Rule: a snapshot at least as recent as the file is authoritative (its
  // absences are the user's deletions, its collapsed list is the user's
  // layout). A snapshot older than the file is a lagging writer — an in-flight
  // debounced write racing a newer one — and only contributes its own entries
  // per id; disk entries it lacks survive. This path cannot tell two open
  // windows' edits apart, which is why revision-aware clients use the 409 path
  // above instead.
  const mergeSnapshots = (base, incoming, { authoritative = false } = {}) => {
    const baseMap = base?.foldersMap && typeof base.foldersMap === "object" ? base.foldersMap : {}
    const incomingMap = incoming?.foldersMap && typeof incoming.foldersMap === "object" ? incoming.foldersMap : {}
    // Timestamps come from client clocks. One ahead of real time stayed in the file as the maximum, and every
    // later honest snapshot then compared as lagging, so deletions and un-collapses stopped persisting until real
    // time caught up. An incoming stamp is capped at now, and a stamp already on disk from the future (written
    // before the cap, or before the clock was set back) does not outrank anything.
    const currentTime = now()
    const readStamp = (value) => (typeof value === "number" && Number.isFinite(value) ? value : 0)
    const storedUpdatedAt = readStamp(base?.updatedAt)
    const baseUpdatedAt = storedUpdatedAt > currentTime ? 0 : storedUpdatedAt
    const incomingUpdatedAt = Math.min(readStamp(incoming?.updatedAt), currentTime)
    const incomingIsAuthoritative = authoritative || incomingUpdatedAt >= baseUpdatedAt

    const foldersMap = {}
    for (const scopeKey of new Set([...Object.keys(baseMap), ...Object.keys(incomingMap)])) {
      const byId = new Map()
      for (const folder of Array.isArray(baseMap[scopeKey]) ? baseMap[scopeKey] : []) {
        if (folder && typeof folder.id === "string") byId.set(folder.id, folder)
      }
      for (const folder of Array.isArray(incomingMap[scopeKey]) ? incomingMap[scopeKey] : []) {
        if (folder && typeof folder.id === "string") byId.set(folder.id, folder)
      }
      // An authoritative snapshot already replaced every base entry it carried;
      // a base entry it lacks is a deletion. A lagging snapshot only overlays
      // its own entries and must not erase what it never saw.
      if (incomingIsAuthoritative) {
        const incomingIds = new Set(
          (Array.isArray(incomingMap[scopeKey]) ? incomingMap[scopeKey] : [])
            .filter((folder) => folder && typeof folder.id === "string")
            .map((folder) => folder.id),
        )
        for (const id of byId.keys()) {
          if (!incomingIds.has(id)) byId.delete(id)
        }
      }
      foldersMap[scopeKey] = [...byId.values()]
    }

    const baseCollapsed = Array.isArray(base?.collapsedFolderIds) ? base.collapsedFolderIds : []
    const incomingCollapsed = Array.isArray(incoming?.collapsedFolderIds) ? incoming.collapsedFolderIds : []
    // A lagging snapshot speaks only for folders the newer file does not know: unioning its collapsed list put
    // back a folder the user had since expanded in the save that already landed.
    const baseFolderIds = new Set(
      Object.values(baseMap).flatMap((folders) =>
        (Array.isArray(folders) ? folders : []).map((folder) => folder?.id).filter((id) => typeof id === "string"),
      ),
    )
    const collapsedFolderIds = incomingIsAuthoritative
      ? incomingCollapsed
      : [...new Set([...baseCollapsed, ...incomingCollapsed.filter((id) => !baseFolderIds.has(id))])]
    const existingIds = new Set(
      Object.values(foldersMap).flatMap((folders) =>
        (Array.isArray(folders) ? folders : []).map((folder) => folder?.id).filter((id) => typeof id === "string"),
      ),
    )
    return {
      version: 1,
      foldersMap,
      collapsedFolderIds: collapsedFolderIds.filter((id) => existingIds.has(id)),
      updatedAt: Math.max(baseUpdatedAt, incomingUpdatedAt),
    }
  }

  // Serialize read-merge-write so concurrent POSTs cannot interleave.
  let writeQueue = Promise.resolve()

  app.get("/api/session-folders", async (_req, res) => {
    try {
      const snapshot = await readSnapshot()
      return res.json(snapshot ? { ...snapshot, revision: readRevision(snapshot) } : emptySnapshot())
    } catch (error) {
      const message = error instanceof Error ? error.message : "Failed to read session folders"
      return res.status(500).json({ error: message })
    }
  })

  app.post("/api/session-folders", async (req, res) => {
    const body = req.body
    if (!body || typeof body !== "object" || Array.isArray(body)) {
      return res.status(400).json({ error: "Body must be an object" })
    }
    if (Buffer.byteLength(JSON.stringify(body), "utf8") > MAX_BODY_BYTES) {
      return res.status(413).json({ error: "Payload too large" })
    }
    const hasBaseRevision = body.baseRevision !== undefined && body.baseRevision !== null
    if (hasBaseRevision && !(Number.isSafeInteger(body.baseRevision) && body.baseRevision >= 0)) {
      return res.status(400).json({ error: "baseRevision must be a non-negative integer" })
    }

    let conflict = null
    let savedRevision = null
    const write = writeQueue.catch(() => undefined).then(async () => {
      const base = await readSnapshot({ recoverCorrupt: true })
      const currentRevision = readRevision(base)
      if (hasBaseRevision && body.baseRevision !== currentRevision) {
        conflict = base
          ? { ...base, revision: currentRevision }
          : emptySnapshot()
        return
      }
      const merged = { ...mergeSnapshots(base, body, { authoritative: hasBaseRevision }), revision: currentRevision + 1 }
      await writeJsonFile(filePath, merged)
      savedRevision = merged.revision
    })
    writeQueue = write

    try {
      await write
      if (conflict) {
        return res.status(409).json({ error: "Session folders changed since baseRevision", current: conflict })
      }
      return res.json({ success: true, revision: savedRevision })
    } catch (error) {
      const message = error instanceof Error ? error.message : "Failed to write session folders"
      return res.status(500).json({ error: message })
    }
  })
}
