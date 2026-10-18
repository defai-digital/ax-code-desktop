// Listing stays with the runtime's file API. read/raw are deliberately not
// core-backed: `/file/content` answers `type: "binary"` with an empty body for
// a binary it does not classify, and decodes the rest lossily, so the desktop
// reads the already-validated canonical path itself (bytes for raw, strict
// UTF-8 for text). Mutations were already Desktop-owned.
export const CORE_BACKED_FS_ROUTES = ["GET /api/fs/list"]

export const DESKTOP_OWNED_FS_MUTATION_ROUTES = [
  "POST /api/fs/write",
  "POST /api/fs/mkdir",
  "POST /api/fs/clone",
  "POST /api/fs/delete",
  "POST /api/fs/rename",
  "POST /api/fs/reveal",
  "POST /api/fs/exec",
]

export const isCoreBackedFsRoute = (method, routePath) => CORE_BACKED_FS_ROUTES.includes(`${method} ${routePath}`)
