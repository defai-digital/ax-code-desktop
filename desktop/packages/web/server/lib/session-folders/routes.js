const MAX_BODY_BYTES = 4 * 1024 * 1024

export const registerSessionFoldersRoutes = (app, dependencies) => {
  const { fsPromises, path, openchamberDataDir } = dependencies

  const filePath = path.join(openchamberDataDir, "sessions-directories.json")

  const ensureDir = async () => {
    await fsPromises.mkdir(path.dirname(filePath), { recursive: true })
  }

  const readSnapshot = async () => {
    const raw = await fsPromises.readFile(filePath, "utf8").catch((error) => {
      if (error && error.code === "ENOENT") return null
      throw error
    })
    if (raw === null) return null
    return JSON.parse(raw)
  }

  // POST bodies are full client snapshots. Two windows each load once and then
  // write their own whole map, so a plain overwrite silently drops folders
  // created in the other window. Merge per scope by folder id instead: the
  // incoming write wins for the entries it carries, and entries it never knew
  // survive. A folder deleted in one window can resurface via a stale snapshot
  // from another — the accepted price of a tombstone-free protocol, and far
  // cheaper than silently losing folders.
  const mergeSnapshots = (base, incoming) => {
    const baseMap = base?.foldersMap && typeof base.foldersMap === "object" ? base.foldersMap : {}
    const incomingMap = incoming?.foldersMap && typeof incoming.foldersMap === "object" ? incoming.foldersMap : {}
    const foldersMap = {}
    for (const scopeKey of new Set([...Object.keys(baseMap), ...Object.keys(incomingMap)])) {
      const byId = new Map()
      for (const folder of Array.isArray(baseMap[scopeKey]) ? baseMap[scopeKey] : []) {
        if (folder && typeof folder.id === "string") byId.set(folder.id, folder)
      }
      for (const folder of Array.isArray(incomingMap[scopeKey]) ? incomingMap[scopeKey] : []) {
        if (folder && typeof folder.id === "string") byId.set(folder.id, folder)
      }
      foldersMap[scopeKey] = [...byId.values()]
    }
    const baseCollapsed = Array.isArray(base?.collapsedFolderIds) ? base.collapsedFolderIds : []
    const incomingCollapsed = Array.isArray(incoming?.collapsedFolderIds) ? incoming.collapsedFolderIds : []
    const baseUpdatedAt = typeof base?.updatedAt === "number" ? base.updatedAt : 0
    const incomingUpdatedAt = typeof incoming?.updatedAt === "number" ? incoming.updatedAt : 0
    return {
      version: 1,
      foldersMap,
      collapsedFolderIds: [...new Set([...baseCollapsed, ...incomingCollapsed])],
      updatedAt: Math.max(baseUpdatedAt, incomingUpdatedAt),
    }
  }

  // Serialize read-merge-write so concurrent POSTs cannot interleave.
  let writeQueue = Promise.resolve()

  app.get("/api/session-folders", async (_req, res) => {
    try {
      const raw = await fsPromises.readFile(filePath, "utf8").catch((error) => {
        if (error && error.code === "ENOENT") return null
        throw error
      })
      // Only a missing file is "no folders yet": a file that exists and is empty is not valid JSON, and an
      // empty snapshot is authoritative to the client, so it would replace the user's layout with nothing. It
      // falls through to the parse below and is reported the same way as any other corrupt file.
      if (raw === null) {
        return res.json({ version: 1, foldersMap: {}, collapsedFolderIds: [], updatedAt: 0 })
      }
      try {
        const parsed = JSON.parse(raw)
        return res.json(parsed)
      } catch {
        // A corrupted file must not read as "no folders": the client treats the empty
        // snapshot as authoritative and a follow-up write would replace the user's
        // folders with nothing. Fail loudly so the client keeps its own copy.
        return res.status(500).json({ error: "Session folders data is corrupted" })
      }
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

    const write = writeQueue.catch(() => undefined).then(async () => {
      let base = null
      try {
        base = await readSnapshot()
      } catch {
        // A corrupted file cannot be merged; the incoming snapshot becomes the
        // new base (same recovery the plain overwrite offered).
        base = null
      }
      const merged = mergeSnapshots(base, body)
      const serialized = JSON.stringify(merged, null, 2)

      let tmp
      let saved = false
      try {
        await ensureDir()
        tmp = `${filePath}.tmp-${process.pid}-${Date.now()}-${Math.random().toString(16).slice(2)}`
        await fsPromises.writeFile(tmp, serialized, "utf8")
        await fsPromises.rename(tmp, filePath)
        saved = true
      } finally {
        if (tmp && !saved) {
          await fsPromises.unlink(tmp).catch(() => {})
        }
      }
    })
    writeQueue = write

    try {
      await write
      return res.json({ success: true })
    } catch (error) {
      const message = error instanceof Error ? error.message : "Failed to write session folders"
      return res.status(500).json({ error: message })
    }
  })
}
