export const CORE_BACKED_FS_ROUTES = ["GET /api/fs/read", "GET /api/fs/list", "GET /api/fs/raw"]

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
