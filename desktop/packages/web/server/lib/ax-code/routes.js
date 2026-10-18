import { createProjectIdFromPath } from "../projects/project-id.js"
import { compareVersions, evaluateAxCodeCompatibility, MIN_SUPPORTED_AX_CODE_VERSION } from "./version-compat.js"
import { AX_CODE_CONFIG_DIR } from "./shared.js"
import fs from "fs"
import path from "path"

// Ceiling for a body forwarded verbatim to the runtime (a prompt with
// attachments). Resolved per request so an operator (or a test) can lower it
// without a rebuild.
const DEFAULT_MAX_FORWARD_BODY_BYTES = 64 * 1024 * 1024
// Bound for a non-streaming call to the runtime. `server/index.js` passes the same value as its
// long-request timeout; it is also the default here so the bound holds for any caller.
const DEFAULT_LONG_REQUEST_TIMEOUT_MS = 4 * 60 * 1000

const resolveMaxForwardBodyBytes = () => {
  const raw = Number(process.env.AX_CODE_DESKTOP_MAX_FORWARD_BODY_BYTES)
  return Number.isFinite(raw) && raw > 0 ? raw : DEFAULT_MAX_FORWARD_BODY_BYTES
}

const PROMPT_ASYNC_IDEMPOTENCY_TTL_MS = 2 * 60 * 1000
const PROMPT_ASYNC_INFLIGHT_MAX_MS = PROMPT_ASYNC_IDEMPOTENCY_TTL_MS * 20
const PROVIDER_AUTH_SCOPES = new Set(["auth", "user", "project", "custom", "all"])

class ProviderAuthRouteError extends Error {
  constructor(statusCode, message) {
    super(message)
    this.statusCode = statusCode
  }
}

const resolveProviderAuthId = (providerId) => {
  if (typeof providerId === "string" && providerId.trim()) {
    return providerId
  }
  throw new ProviderAuthRouteError(400, "Provider ID is required")
}

const resolveProviderAuthScope = (scope) => {
  if (typeof scope !== "string") return "auth"
  if (PROVIDER_AUTH_SCOPES.has(scope)) return scope
  throw new ProviderAuthRouteError(400, "Invalid scope")
}

/**
 * Answer an unexpected failure with a stable message and log the detail. The raw
 * exception message can carry absolute paths (fs errors, the managed runtime
 * binary) and upstream output, so it must not reach the client.
 */
const sendUnexpectedError = (res, message, error, { status = 500, extras = {} } = {}) => {
  console.error(`[ax-code routes] ${message}:`, error instanceof Error ? error.message : error)
  if (res.headersSent) {
    return
  }
  res.status(status).json({ error: message, ...extras })
}

export const registerAxCodeRoutes = (app, dependencies) => {
  const longRequestTimeoutMs =
    Number.isFinite(dependencies?.longRequestTimeoutMs) && dependencies.longRequestTimeoutMs > 0
      ? dependencies.longRequestTimeoutMs
      : DEFAULT_LONG_REQUEST_TIMEOUT_MS

  const {
    clientReloadDelayMs,
    getAxCodeResolutionSnapshot,
    getAxCodeBinarySource,
    formatSettingsResponse,
    readSettingsFromDisk,
    readSettingsFromDiskMigrated,
    persistSettings,
    sanitizeProjects,
    validateDirectoryPath,
    resolveProjectDirectory,
    getProviderSources,
    removeProviderConfig,
    refreshAxCodeAfterConfigChange,
    backgroundAxCodeReloader,
    buildAxCodeUrl,
    getAxCodeAuthHeaders,
  } = dependencies

  let authLibrary = null
  const pendingMcpAuthContextByState = new Map()
  const promptAsyncRequestsByKey = new Map()
  const PENDING_MCP_AUTH_TTL_MS = 30 * 60 * 1000
  const getAuthLibrary = async () => {
    if (!authLibrary) {
      authLibrary = await import("./auth.js")
    }
    return authLibrary
  }

  const normalizePendingString = (value) => {
    if (typeof value !== "string") {
      return null
    }

    const trimmed = value.trim()
    return trimmed || null
  }

  const fetchLatestAxCodeVersion = async () => {
    // ax-code is not distributed via npm or public GitHub releases.
    // Version update checks are disabled.
    return null
  }

  const resolvedBinarySource = () =>
    typeof getAxCodeBinarySource === "function" ? getAxCodeBinarySource() || null : null

  const pruneExpiredPendingMcpAuthContexts = () => {
    const now = Date.now()
    for (const [state, entry] of pendingMcpAuthContextByState.entries()) {
      if (!entry || typeof entry.expiresAt !== "number" || entry.expiresAt <= now) {
        pendingMcpAuthContextByState.delete(state)
      }
    }
  }

  const prunePromptAsyncRequests = () => {
    const now = Date.now()
    for (const [key, entry] of promptAsyncRequestsByKey.entries()) {
      const completedAt = typeof entry?.completedAt === "number" ? entry.completedAt : 0
      const startedAt = typeof entry?.startedAt === "number" ? entry.startedAt : 0
      const reference = completedAt || startedAt
      const inFlight = !entry?.result && Boolean(entry?.promise)
      // Only a settled entry may be aged out: pruning a request that is still
      // running dropped its dedup key, so a retry with the same messageID issued
      // a second upstream prompt. The longer limit only exists so a request that
      // never settles cannot keep its entry forever.
      const limit = inFlight ? PROMPT_ASYNC_INFLIGHT_MAX_MS : PROMPT_ASYNC_IDEMPOTENCY_TTL_MS
      if (!reference || now - reference > limit) {
        promptAsyncRequestsByKey.delete(key)
      }
    }
  }

  const buildUpstreamPathWithQuery = (basePath, req) => {
    const requestUrl = typeof req.originalUrl === "string" ? req.originalUrl : req.url
    const parsed = new URL(requestUrl || "/", "http://localhost")
    return `${basePath}${parsed.search || ""}`
  }

  // Read the request body for proxy-style forwarding. `/api/session/*` routes
  // are intentionally NOT run through express.json() (see
  // registerCommonRequestMiddleware — they fall to the `next()` branch so the
  // generic streaming proxy can forward them), so `req.body` is undefined here
  // and the raw stream is still intact. Read it verbatim. If a body parser DID
  // run for this path (other mounts), fall back to the parsed object so this
  // helper stays correct regardless of how the route is wired.
  const readForwardBodyText = (req) =>
    new Promise((resolve, reject) => {
      if (req.body !== undefined && req.body !== null) {
        try {
          resolve(JSON.stringify(req.body))
        } catch {
          resolve("{}")
        }
        return
      }
      const chunks = []
      let totalBytes = 0
      let settled = false
      const fail = (error) => {
        if (settled) return
        settled = true
        reject(error)
      }
      req.on("data", (chunk) => {
        if (settled) return
        totalBytes += chunk?.length ?? 0
        if (totalBytes > resolveMaxForwardBodyBytes()) {
          // The body was accumulated without any ceiling, so a large or endless
          // upload could exhaust the server before the upstream ever saw it.
          const error = new Error("Request body too large")
          error.statusCode = 413
          // Reject without destroying the socket: the error handler answers 413,
          // and killing the request here made the client see a hang-up instead.
          fail(error)
          return
        }
        chunks.push(chunk)
      })
      req.on("end", () => {
        if (settled) return
        settled = true
        resolve(Buffer.concat(chunks).toString("utf8") || "{}")
      })
      req.on("error", fail)
    })

  const fetchAxCodeJsonRoute = async (req, upstreamPath, forwardBody) => {
    const response = await fetch(buildAxCodeUrl(upstreamPath, ""), {
      method: req.method,
      headers: {
        Accept: "application/json",
        "Content-Type": "application/json",
        ...getAxCodeAuthHeaders(),
      },
      body:
        req.method === "GET" || req.method === "HEAD"
          ? undefined
          : typeof forwardBody === "string"
            ? forwardBody
            : JSON.stringify(req.body ?? {}),
      // A runtime that accepted the connection and stopped answering left the request pending for
      // as long as the client waited, so the 503 below never ran and the composer kept its
      // "sending" state. Nothing forwarded here streams, so a bound cannot cut a stream short.
      signal: AbortSignal.timeout(longRequestTimeoutMs),
    })
    const contentType = response.headers.get("content-type") || "application/json"
    const bodyText = await response.text().catch(() => "")
    return {
      status: response.status,
      ok: response.ok,
      contentType,
      bodyText,
    }
  }

  const sendAxCodeRouteResult = (res, result) => {
    res.status(result.status)
    if (result.contentType) {
      res.type(result.contentType)
    }
    if (result.bodyText) {
      return res.send(result.bodyText)
    }
    return res.end()
  }

  const parseJsonBodyText = (text) => {
    if (!text || typeof text !== "string") return null
    try {
      const parsed = JSON.parse(text)
      return parsed && typeof parsed === "object" ? parsed : null
    } catch {
      return null
    }
  }

  app.post("/api/session/:sessionId/prompt_async", async (req, res) => {
    const sessionId = typeof req.params?.sessionId === "string" ? req.params.sessionId : ""
    // The body is not pre-parsed for this route, so read the raw payload and
    // forward it verbatim. Parsing it here (rather than relying on req.body)
    // also recovers the messageID used for the idempotency dedup key.
    const bodyText = await readForwardBodyText(req)
    const parsedBody = parseJsonBodyText(bodyText)
    const messageId = normalizePendingString(parsedBody?.messageID) || ""
    const key = sessionId && messageId ? `${sessionId}:${messageId}` : null
    const upstreamPath = buildUpstreamPathWithQuery(`/session/${encodeURIComponent(sessionId)}/prompt_async`, req)

    try {
      prunePromptAsyncRequests()
      if (key) {
        const existing = promptAsyncRequestsByKey.get(key)
        if (existing?.result) {
          return sendAxCodeRouteResult(res, existing.result)
        }
        if (existing?.promise) {
          const result = await existing.promise
          return sendAxCodeRouteResult(res, result)
        }
      }

      const promise = fetchAxCodeJsonRoute(req, upstreamPath, bodyText)
      if (key) {
        promptAsyncRequestsByKey.set(key, { startedAt: Date.now(), promise })
      }

      const result = await promise
      if (key) {
        if (result.ok) {
          promptAsyncRequestsByKey.set(key, {
            completedAt: Date.now(),
            result,
          })
        } else {
          promptAsyncRequestsByKey.delete(key)
        }
      }
      return sendAxCodeRouteResult(res, result)
    } catch (error) {
      if (key) {
        promptAsyncRequestsByKey.delete(key)
      }
      return sendUnexpectedError(res, "Failed to send prompt", error, {
        status: 503,
        extras: { restarting: true },
      })
    }
  })

  app.post("/api/session/:sessionId/command", async (req, res) => {
    const sessionId = typeof req.params?.sessionId === "string" ? req.params.sessionId : ""
    const bodyText = await readForwardBodyText(req)
    const parsedBody = parseJsonBodyText(bodyText)
    const command = normalizePendingString(parsedBody?.command) || ""
    const upstreamPath = buildUpstreamPathWithQuery(`/session/${encodeURIComponent(sessionId)}/command`, req)

    try {
      const result = await fetchAxCodeJsonRoute(req, upstreamPath, bodyText)
      const payload = parseJsonBodyText(result.bodyText)
      // Prefer real client errors from the CLI (command not found is now a 400).
      if (
        result.status === 400 &&
        typeof payload?.message === "string" &&
        /^Command not found:/i.test(payload.message)
      ) {
        return res.status(400).json({
          error: payload.message,
          message: payload.message,
          retryable: false,
        })
      }
      // Legacy CLI: command-not-found used to leak as opaque 500 UnknownError.
      if (
        result.status === 500 &&
        payload?.name === "UnknownError" &&
        typeof payload?.message === "string" &&
        payload.message.toLowerCase().includes("internal server error") &&
        command
      ) {
        return res.status(400).json({
          error: `Unknown command: ${command}`,
          message: `Unknown command: ${command}. If this is council/arena, upgrade the ax-code CLI to match Desktop (v6.11.3+ / v7).`,
          retryable: false,
        })
      }
      return sendAxCodeRouteResult(res, result)
    } catch (error) {
      return sendUnexpectedError(res, "Failed to run command", error, {
        status: 503,
        extras: { restarting: true },
      })
    }
  })

  app.get("/api/config/settings", async (_req, res) => {
    try {
      const settings = await readSettingsFromDiskMigrated()
      res.json(formatSettingsResponse(settings))
    } catch (error) {
      console.error("Failed to read settings:", error)
      res.status(500).json({ error: "Failed to read settings" })
    }
  })

  app.get("/api/config/ax-code-resolution", async (_req, res) => {
    try {
      const settings = await readSettingsFromDiskMigrated()
      const resolution = await getAxCodeResolutionSnapshot(settings)
      res.json(resolution)
    } catch (error) {
      console.error("Failed to resolve ax-code binary:", error)
      res.status(500).json({ error: "Failed to resolve ax-code binary" })
    }
  })

  app.post("/api/ax-code/upgrade", async (req, res) => {
    try {
      // The bundled runtime ships inside the installer and is pinned to the
      // app version; only an app update may replace it.
      if (typeof getAxCodeBinarySource === "function" && getAxCodeBinarySource() === "bundled") {
        return res.status(409).json({
          success: false,
          managedByAppUpdate: true,
          error: "The bundled ax-code runtime is managed by the app update and cannot be upgraded separately",
        })
      }
      const target = normalizePendingString(req.body?.target) || undefined
      const response = await fetch(buildAxCodeUrl("/global/upgrade", ""), {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Accept: "application/json",
          ...getAxCodeAuthHeaders(),
        },
        body: JSON.stringify(target ? { target } : {}),
        // A wedged runtime would otherwise hold this request open forever. The
        // call waits for the download and install, so the budget is the
        // longest one the HTTP stack actually honours (undici aborts a
        // response that starts later than ~5 minutes); aborting earlier made
        // the client report a failure the runtime then completed anyway.
        signal: AbortSignal.timeout(4 * 60 * 1000),
      })
      const payload = await response.json().catch(() => null)
      if (!response.ok) {
        return res.status(response.status).json({
          success: false,
          error: payload?.error || response.statusText || "Failed to upgrade ax-code",
        })
      }

      try {
        await refreshAxCodeAfterConfigChange("ax-code upgrade")
      } catch (restartError) {
        return sendUnexpectedError(res, "ax-code upgraded, but restart failed", restartError, {
          extras: { success: false, upgraded: true },
        })
      }

      return res.json({ ...(payload ?? { success: true }), restarted: true })
    } catch (error) {
      return sendUnexpectedError(res, "Failed to upgrade ax-code", error, { extras: { success: false } })
    }
  })

  app.get("/api/ax-code/upgrade-status", async (_req, res) => {
    try {
      const [healthResponse, latestVersion] = await Promise.all([
        fetch(buildAxCodeUrl("/global/health", ""), {
          method: "GET",
          headers: { Accept: "application/json", ...getAxCodeAuthHeaders() },
        }),
        fetchLatestAxCodeVersion(),
      ])
      const health = await healthResponse.json().catch(() => null)
      if (!healthResponse.ok) {
        console.warn("ax-code upgrade status probe failed:", health?.error || healthResponse.statusText)
        return res.status(healthResponse.status).json({
          available: null,
          error: "Failed to read ax-code version",
        })
      }
      const currentVersion = typeof health?.version === "string" ? health.version.replace(/^v/, "") : null
      const compatibility = evaluateAxCodeCompatibility(currentVersion)
      if (!currentVersion || !latestVersion) {
        return res.json({
          available: null,
          currentVersion,
          latestVersion: latestVersion || null,
          minSupportedVersion: MIN_SUPPORTED_AX_CODE_VERSION,
          compatible: compatibility.compatible,
          binarySource: resolvedBinarySource(),
        })
      }
      const available = compareVersions(latestVersion, currentVersion) > 0
      return res.json({
        available,
        currentVersion,
        latestVersion,
        minSupportedVersion: MIN_SUPPORTED_AX_CODE_VERSION,
        compatible: compatibility.compatible,
        binarySource: resolvedBinarySource(),
      })
    } catch (error) {
      return sendUnexpectedError(res, "Failed to check ax-code upgrade status", error, {
        extras: { available: null },
      })
    }
  })

  app.put("/api/config/settings", async (req, res) => {
    console.log("[API:PUT /api/config/settings] Received request")
    try {
      const updated = await persistSettings(req.body ?? {})
      console.log(`[API:PUT /api/config/settings] Success, returning ${updated.projects?.length || 0} projects`)
      res.json(updated)
    } catch (error) {
      console.error("[API:PUT /api/config/settings] Failed to save settings:", error)
      console.error("[API:PUT /api/config/settings] Error stack:", error.stack)
      res.status(500).json({ error: "Failed to save settings" })
    }
  })

  app.post("/api/mcp/auth/pending", async (req, res) => {
    try {
      pruneExpiredPendingMcpAuthContexts()

      const state = normalizePendingString(req.body?.state)
      if (!state) {
        return res.json({ success: true, context: null })
      }

      const name = normalizePendingString(req.body?.name)
      if (!name) {
        return res.status(400).json({ error: "MCP server name is required" })
      }

      const entry = {
        name,
        directory: normalizePendingString(req.body?.directory),
        expiresAt: Date.now() + PENDING_MCP_AUTH_TTL_MS,
      }
      pendingMcpAuthContextByState.set(state, entry)

      return res.json({
        success: true,
        context: {
          name: entry.name,
          directory: entry.directory,
        },
      })
    } catch (error) {
      console.error("Failed to store pending MCP auth context:", error)
      return sendUnexpectedError(res, "Failed to store pending MCP auth context", error)
    }
  })

  app.get("/api/mcp/auth/pending", async (req, res) => {
    try {
      pruneExpiredPendingMcpAuthContexts()

      const state = normalizePendingString(Array.isArray(req.query?.state) ? req.query.state[0] : req.query?.state)
      if (!state) {
        return res.json(null)
      }

      const pendingMcpAuthContext = pendingMcpAuthContextByState.get(state) ?? null
      if (!pendingMcpAuthContext) {
        return res.status(404).json({ error: "No pending MCP auth context" })
      }

      return res.json(pendingMcpAuthContext)
    } catch (error) {
      console.error("Failed to read pending MCP auth context:", error)
      return sendUnexpectedError(res, "Failed to read pending MCP auth context", error)
    }
  })

  app.delete("/api/mcp/auth/pending", async (req, res) => {
    try {
      pruneExpiredPendingMcpAuthContexts()

      const state = normalizePendingString(Array.isArray(req.query?.state) ? req.query.state[0] : req.query?.state)
      if (!state) {
        return res.json({ success: true })
      }

      pendingMcpAuthContextByState.delete(state)
      return res.json({ success: true })
    } catch (error) {
      console.error("Failed to clear pending MCP auth context:", error)
      return sendUnexpectedError(res, "Failed to clear pending MCP auth context", error)
    }
  })

  app.get("/api/provider/:providerId/source", async (req, res) => {
    try {
      const { providerId } = req.params
      if (!providerId) {
        return res.status(400).json({ error: "Provider ID is required" })
      }

      const headerDirectory = typeof req.get === "function" ? req.get("x-ax-code-directory") : null
      const queryDirectory = Array.isArray(req.query?.directory) ? req.query.directory[0] : req.query?.directory
      const requestedDirectory = headerDirectory || queryDirectory || null

      let directory = null
      const resolved = await resolveProjectDirectory(req)
      if (resolved.directory) {
        directory = resolved.directory
      } else if (requestedDirectory) {
        return res.status(400).json({ error: resolved.error })
      }

      const sources = getProviderSources(providerId, directory)
      const { getProviderAuth } = await getAuthLibrary()
      const auth = getProviderAuth(providerId)
      sources.sources.auth.exists = Boolean(auth)

      return res.json({
        providerId,
        sources: sources.sources,
      })
    } catch (error) {
      console.error("Failed to get provider sources:", error)
      return sendUnexpectedError(res, "Failed to get provider sources", error)
    }
  })

  // Remove provider auth via ax-code's API (uses file locking, encryption,
  // and per-directory cache invalidation). Falls back to direct auth.json
  // manipulation when ax-code is unreachable.
  const removeProviderAuthViaApi = async (providerId) => {
    try {
      const url = buildAxCodeUrl(`/auth/${encodeURIComponent(providerId)}`, "")
      const response = await fetch(url, {
        method: "DELETE",
        headers: {
          Accept: "application/json",
          ...getAxCodeAuthHeaders(),
        },
        signal: AbortSignal.timeout(10000),
      })
      if (response.ok) {
        await response.body?.cancel()
        return true
      }
      // 404 means the auth entry does not exist — nothing to remove.
      if (response.status === 404) {
        await response.body?.cancel()
        return false
      }
      // Other 4xx (401, 403, 408, etc.) and 5xx: fall back to direct
      // file removal so the entry is cleaned up even when ax-code
      // rejects the API call (e.g. auth header mismatch).
      await response.body?.cancel()
      console.warn("ax-code DELETE /auth returned non-success, falling back to direct file removal", {
        providerId,
        status: response.status,
      })
    } catch (error) {
      console.warn("Failed to call ax-code DELETE /auth, falling back to direct file removal", {
        providerId,
        error: error?.message || error,
      })
    }
    // Fallback: direct auth.json manipulation
    const { removeProviderAuth } = await getAuthLibrary()
    return removeProviderAuth(providerId)
  }

  app.delete("/api/provider/:providerId/auth", async (req, res) => {
    try {
      const providerId = resolveProviderAuthId(req.params?.providerId)
      const scope = resolveProviderAuthScope(req.query?.scope)
      const headerDirectory = typeof req.get === "function" ? req.get("x-ax-code-directory") : null
      const queryDirectory = Array.isArray(req.query?.directory) ? req.query.directory[0] : req.query?.directory
      const requestedDirectory = headerDirectory || queryDirectory || null
      const resolved = await resolveProjectDirectory(req)
      if ((scope === "project" || requestedDirectory) && !resolved.directory) {
        return res.status(400).json({ error: resolved.error })
      }
      const directory = resolved.directory || null

      const removeByScope = {
        auth: () => removeProviderAuthViaApi(providerId),
        user: () => removeProviderConfig(providerId, directory, "user"),
        project: () => removeProviderConfig(providerId, directory, "project"),
        custom: () => removeProviderConfig(providerId, directory, "custom"),
        all: async () => {
          const authRemoved = await removeProviderAuthViaApi(providerId)
          const userRemoved = removeProviderConfig(providerId, directory, "user")
          const projectRemoved = directory ? removeProviderConfig(providerId, directory, "project") : false
          const customRemoved = removeProviderConfig(providerId, directory, "custom")
          return authRemoved || userRemoved || projectRemoved || customRemoved
        },
      }
      const removed = await removeByScope[scope]()

      let reload = null
      if (removed) {
        if (backgroundAxCodeReloader) {
          reload = backgroundAxCodeReloader.start(`provider ${providerId} disconnected (${scope})`)
        } else {
          await refreshAxCodeAfterConfigChange(`provider ${providerId} disconnected (${scope})`)
          reload = { alreadyRunning: false, reloadDelayMs: clientReloadDelayMs }
        }
      }

      return res.json({
        success: true,
        removed,
        requiresReload: removed,
        reloadInProgress: reload?.alreadyRunning,
        message: removed
          ? reload?.alreadyRunning
            ? "Provider disconnected. AX Code is already restarting…"
            : "Provider disconnected. AX Code is restarting…"
          : "Provider was not connected",
        reloadDelayMs: reload?.reloadDelayMs,
        reloadTimeoutMs: reload?.reloadTimeoutMs,
      })
    } catch (error) {
      if (error instanceof ProviderAuthRouteError) {
        return res.status(error.statusCode).json({ error: error.message })
      }
      console.error("Failed to disconnect provider:", error)
      return sendUnexpectedError(res, "Failed to disconnect provider", error)
    }
  })

  app.post("/api/ax-code/directory", async (req, res) => {
    try {
      const requestedPath = normalizePendingString(req.body?.path) || ""
      if (!requestedPath) {
        return res.status(400).json({ error: "Path is required" })
      }

      const validated = await validateDirectoryPath(requestedPath)
      if (!validated.ok) {
        return res.status(400).json({ error: validated.error })
      }

      const resolvedPath = validated.directory
      const currentSettings = await readSettingsFromDisk()
      const existingProjects = sanitizeProjects(currentSettings.projects) || []
      const existing = existingProjects.find((project) => project.path === resolvedPath) || null

      const nextProjects = existing
        ? existingProjects
        : [
            ...existingProjects,
            {
              id: createProjectIdFromPath(resolvedPath),
              path: resolvedPath,
              addedAt: Date.now(),
              lastOpenedAt: Date.now(),
            },
          ]

      const activeProjectId = existing ? existing.id : nextProjects[nextProjects.length - 1].id

      const updated = await persistSettings({
        projects: nextProjects,
        activeProjectId,
        lastDirectory: resolvedPath,
      })

      return res.json({
        success: true,
        restarted: false,
        path: resolvedPath,
        settings: updated,
      })
    } catch (error) {
      console.error("Failed to update ax-code working directory:", error)
      return sendUnexpectedError(res, "Failed to update working directory", error)
    }
  })

  // Behavior / Global AGENTS.md endpoints
  const AGENTS_MD_PATH = path.join(AX_CODE_CONFIG_DIR, "AGENTS.md")
  const MAX_BEHAVIOR_PROMPT_SIZE = 1024 * 1024 // 1 MB

  app.get("/api/behavior/agents-md", async (_req, res) => {
    try {
      const content = await fs.promises.readFile(AGENTS_MD_PATH, "utf8")
      return res.json({ content, exists: true })
    } catch (error) {
      if (error && typeof error === "object" && error.code === "ENOENT") {
        return res.json({ content: "", exists: false })
      }
      console.error("Failed to read AGENTS.md:", error)
      return res.status(500).json({ error: "Failed to read AGENTS.md" })
    }
  })

  app.put("/api/behavior/agents-md", async (req, res) => {
    try {
      const content = typeof req.body?.content === "string" ? req.body.content : ""

      if (content.length > MAX_BEHAVIOR_PROMPT_SIZE) {
        return res.status(413).json({ error: `Content exceeds maximum size of ${MAX_BEHAVIOR_PROMPT_SIZE} bytes` })
      }

      // Ensure parent directory exists
      const parentDir = path.dirname(AGENTS_MD_PATH)
      await fs.promises.mkdir(parentDir, { recursive: true })

      await fs.promises.writeFile(AGENTS_MD_PATH, content, "utf8")

      // Refresh ax-code so it picks up the new AGENTS.md without a full restart
      try {
        await refreshAxCodeAfterConfigChange("global behavior (AGENTS.md) updated")
      } catch {
        // Non-fatal: file was written successfully
      }

      return res.json({ success: true })
    } catch (error) {
      console.error("Failed to write AGENTS.md:", error)
      return sendUnexpectedError(res, "Failed to write AGENTS.md", error)
    }
  })
}
