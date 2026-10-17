import crypto from "crypto"
import { SignJWT, jwtVerify } from "jose"
import fs from "fs"
import path from "path"
import os from "os"
import { createUiPasskeys } from "./ui-passkeys.js"

import { UI_SESSION_COOKIE_NAME, resolveUiSessionCookieName } from "./ui-session-cookie.js"

const SESSION_COOKIE_NAME = UI_SESSION_COOKIE_NAME
const SESSION_TTL_MS = 12 * 60 * 60 * 1000
const TRUSTED_DEVICE_SESSION_TTL_MS = 7 * 24 * 60 * 60 * 1000

const RATE_LIMIT_WINDOW_MS = 5 * 60 * 1000
const RATE_LIMIT_MAX_ATTEMPTS = Number(process.env.AX_CODE_DESKTOP_RATE_LIMIT_MAX_ATTEMPTS) || 10
const RATE_LIMIT_LOCKOUT_MS = 15 * 60 * 1000
const RATE_LIMIT_CLEANUP_MS = 60 * 60 * 1000
const RATE_LIMIT_NO_IP_MAX_ATTEMPTS = Number(process.env.AX_CODE_DESKTOP_RATE_LIMIT_NO_IP_MAX_ATTEMPTS) || 3

// Sessions are stateless JWTs, so signing out has to be recorded server-side.
// Only the token id is kept (never the token), and the set is bounded: the
// oldest id is dropped once the cap is reached, which at worst lets a very old
// token stay usable until its own expiry.
const REVOKED_SESSION_MAX = 500
const revokedSessionIds = new Set()

const loginRateLimiter = new Map()
let rateLimitCleanupTimer = null

// Per-key mutex implemented as a chain of promises. Each call to
// withRateLimitLock(key, fn) only runs fn once every previously queued fn for
// the same key has fully settled, and the stored "tail" is normalized to
// never reject so a failing attempt can't wedge later callers. attemptLogin
// (below, inside createUiAuth) holds this lock across the whole evaluate ->
// verify -> record sequence for a login attempt; without holding the lock
// across that whole read-modify-write of the shared loginRateLimiter Map,
// concurrent requests for the same key (e.g. a brute-force script firing
// attempts in parallel) can interleave and lose increments, letting more
// attempts through than maxAttempts before lockout engages.
const rateLimitLocks = new Map()

const withRateLimitLock = (key, fn) => {
  const previousTail = rateLimitLocks.get(key) || Promise.resolve()
  const result = previousTail.then(fn)
  const tail = result.catch(() => {})
  rateLimitLocks.set(key, tail)
  // Release the entry once this chain drains, or every client key that ever hit a
  // login endpoint stays in the map for the life of the process.
  void tail.then(() => {
    if (rateLimitLocks.get(key) === tail) {
      rateLimitLocks.delete(key)
    }
  })
  return result
}

const getClientIp = (req) => {
  const ip = req.ip || req.connection?.remoteAddress
  if (ip) {
    if (ip.startsWith("::ffff:")) {
      return ip.substring(7)
    }
    return ip
  }
  return null
}

const getRateLimitKey = (req) => {
  const ip = getClientIp(req)
  if (ip) return ip
  return "rate-limit:no-ip"
}

const getRateLimitConfig = (key) => {
  if (key === "rate-limit:no-ip") {
    return {
      maxAttempts: RATE_LIMIT_NO_IP_MAX_ATTEMPTS,
      windowMs: RATE_LIMIT_WINDOW_MS,
    }
  }
  return {
    maxAttempts: RATE_LIMIT_MAX_ATTEMPTS,
    windowMs: RATE_LIMIT_WINDOW_MS,
  }
}

// Pure (lock-free) rate-limit primitives. These must only ever be called from
// inside withRateLimitLock(key, ...) — see attemptLogin below, which holds a
// single lock acquisition across the whole evaluate -> verify -> record
// sequence so a brute-force attempt can't race the counter update for the
// same key.
const evaluateRateLimit = (key) => {
  const now = Date.now()
  const { maxAttempts } = getRateLimitConfig(key)

  let record
  try {
    record = loginRateLimiter.get(key)
  } catch (err) {
    console.error("[RateLimit] Failed to get record", { key, error: err.message })
    return {
      allowed: true,
      limit: maxAttempts,
      remaining: maxAttempts,
      reset: Math.ceil((now + RATE_LIMIT_WINDOW_MS) / 1000),
    }
  }

  if (record?.lockedUntil && now < record.lockedUntil) {
    return {
      allowed: false,
      retryAfter: Math.ceil((record.lockedUntil - now) / 1000),
      locked: true,
      limit: maxAttempts,
      remaining: 0,
      reset: Math.ceil(record.lockedUntil / 1000),
    }
  }

  if (record?.lockedUntil && now >= record.lockedUntil) {
    try {
      loginRateLimiter.delete(key)
    } catch (err) {
      console.error("[RateLimit] Failed to delete expired record", { key, error: err.message })
    }
  }

  if (!record || now - record.lastAttempt > RATE_LIMIT_WINDOW_MS) {
    return {
      allowed: true,
      limit: maxAttempts,
      remaining: maxAttempts,
      reset: Math.ceil((now + RATE_LIMIT_WINDOW_MS) / 1000),
    }
  }

  if (record.count >= maxAttempts) {
    const lockedUntil = now + RATE_LIMIT_LOCKOUT_MS
    try {
      loginRateLimiter.set(key, { count: record.count + 1, lastAttempt: now, lockedUntil })
    } catch (err) {
      console.error("[RateLimit] Failed to set lockout", { key, error: err.message })
    }
    return {
      allowed: false,
      retryAfter: Math.ceil(RATE_LIMIT_LOCKOUT_MS / 1000),
      locked: true,
      limit: maxAttempts,
      remaining: 0,
      reset: Math.ceil(lockedUntil / 1000),
    }
  }

  const remaining = maxAttempts - record.count
  const reset = Math.ceil((record.lastAttempt + RATE_LIMIT_WINDOW_MS) / 1000)
  return {
    allowed: true,
    limit: maxAttempts,
    remaining,
    reset,
  }
}

const markFailedAttempt = (key) => {
  const now = Date.now()
  const record = loginRateLimiter.get(key)

  if (!record || now - record.lastAttempt > RATE_LIMIT_WINDOW_MS) {
    try {
      loginRateLimiter.set(key, { count: 1, lastAttempt: now })
    } catch (err) {
      console.error("[RateLimit] Failed to record attempt", { key, error: err.message })
    }
  } else {
    const newCount = record.count + 1
    try {
      loginRateLimiter.set(key, { count: newCount, lastAttempt: now })
    } catch (err) {
      console.error("[RateLimit] Failed to record attempt", { key, error: err.message })
    }
  }
}

const resetRateLimitRecord = (key) => {
  try {
    loginRateLimiter.delete(key)
  } catch (err) {
    console.error("[RateLimit] Failed to clear", { key, error: err.message })
  }
}

const cleanupRateLimitRecords = () => {
  const now = Date.now()
  for (const [key, record] of loginRateLimiter.entries()) {
    const isExpired = record.lockedUntil && now >= record.lockedUntil
    const isStale = now - record.lastAttempt > RATE_LIMIT_CLEANUP_MS
    if (isExpired || isStale) {
      try {
        loginRateLimiter.delete(key)
      } catch (err) {
        console.error("[RateLimit] Cleanup failed", { key, error: err.message })
      }
    }
  }
}

const startRateLimitCleanup = () => {
  if (!rateLimitCleanupTimer) {
    rateLimitCleanupTimer = setInterval(cleanupRateLimitRecords, RATE_LIMIT_CLEANUP_MS)
    if (rateLimitCleanupTimer && typeof rateLimitCleanupTimer.unref === "function") {
      rateLimitCleanupTimer.unref()
    }
  }
}

const stopRateLimitCleanup = () => {
  if (rateLimitCleanupTimer) {
    clearInterval(rateLimitCleanupTimer)
    rateLimitCleanupTimer = null
  }
}

const isSecureRequest = (req) => {
  if (req.secure) {
    return true
  }
  const forwardedProto = req.headers["x-forwarded-proto"]
  if (typeof forwardedProto === "string") {
    const firstProto = forwardedProto.split(",")[0]?.trim().toLowerCase()
    return firstProto === "https"
  }
  return false
}

const parseCookies = (cookieHeader) => {
  if (!cookieHeader || typeof cookieHeader !== "string") {
    return {}
  }

  return cookieHeader.split(";").reduce((acc, segment) => {
    const [name, ...rest] = segment.split("=")
    if (!name) {
      return acc
    }
    const key = name.trim()
    if (!key) {
      return acc
    }
    const value = rest.join("=").trim()
    try {
      acc[key] = decodeURIComponent(value || "")
    } catch {
      acc[key] = value || ""
    }
    return acc
  }, {})
}

const buildCookie = ({ name, value, maxAge, secure }) => {
  const attributes = [`${name}=${value}`, "Path=/", "HttpOnly", "SameSite=Strict"]

  if (typeof maxAge === "number") {
    attributes.push(`Max-Age=${Math.max(0, Math.floor(maxAge))}`)
  }

  const expires = maxAge === 0 ? "Thu, 01 Jan 1970 00:00:00 GMT" : new Date(Date.now() + maxAge * 1000).toUTCString()

  attributes.push(`Expires=${expires}`)

  if (secure) {
    attributes.push("Secure")
  }

  return attributes.join("; ")
}

const normalizePassword = (candidate) => {
  if (typeof candidate !== "string") {
    return ""
  }
  return candidate.normalize().trim()
}

export const derivePasswordBinding = (normalizedPassword, jwtSecret) =>
  crypto.scryptSync(normalizedPassword, `ax-code-ui-passkey-binding:${jwtSecret}`, 64).toString("hex")

const isTrustedDeviceRequest = (value) => value === true

const AX_CODE_DESKTOP_DATA_DIR = process.env.AX_CODE_DESKTOP_DATA_DIR
  ? path.resolve(process.env.AX_CODE_DESKTOP_DATA_DIR)
  : path.join(os.homedir(), ".config", "openchamber")
const JWT_SECRET_FILE = path.join(AX_CODE_DESKTOP_DATA_DIR, "jwt-secret")

// HS256 with a short key is guessable: a captured session cookie could be
// forged offline. Require 256 bits and treat anything shorter as absent.
export const MIN_JWT_SECRET_BYTES = 32
export const isStrongJwtSecret = (value) =>
  typeof value === "string" && Buffer.byteLength(value.trim(), "utf8") >= MIN_JWT_SECRET_BYTES

const resolveEnvJwtSecret = () => {
  const envSecret = process.env.AX_CODE_JWT_SECRET || process.env.AX_CODE_DESKTOP_JWT_SECRET
  if (!envSecret) {
    return null
  }
  if (!isStrongJwtSecret(envSecret)) {
    console.error(
      `[JWT] Ignoring AX_CODE_JWT_SECRET: it must be at least ${MIN_JWT_SECRET_BYTES} bytes; generating a strong secret instead.`,
    )
    return null
  }
  return envSecret
}

function getOrCreateJwtSecret() {
  const envSecret = resolveEnvJwtSecret()
  if (envSecret) {
    return new TextEncoder().encode(envSecret)
  }

  try {
    const stored = fs.readFileSync(JWT_SECRET_FILE, "utf8").trim()
    if (isStrongJwtSecret(stored)) {
      return new TextEncoder().encode(stored)
    }
    console.warn(`[JWT] Replacing a too-short stored secret at ${JWT_SECRET_FILE}`)
  } catch (e) {
    if (e?.code !== "ENOENT") {
      console.warn("[JWT] Failed to read secret file:", e.message)
    }
  }

  const secret = crypto.randomBytes(32).toString("hex")
  try {
    fs.mkdirSync(AX_CODE_DESKTOP_DATA_DIR, { recursive: true })
    fs.writeFileSync(JWT_SECRET_FILE, secret, { mode: 0o600 })
    console.log("[JWT] Generated and persisted new secret to", JWT_SECRET_FILE)
  } catch (e) {
    console.warn("[JWT] Failed to persist secret:", e.message)
  }

  return new TextEncoder().encode(secret)
}

function persistJwtSecret(secret) {
  // Same strongness rule as getOrCreateJwtSecret: a weak env secret is ignored,
  // so signing out globally must not be blocked by it.
  if (resolveEnvJwtSecret()) {
    const error = new Error("Global sign-out is unavailable while AX_CODE_JWT_SECRET is set")
    error.statusCode = 400
    throw error
  }

  fs.mkdirSync(AX_CODE_DESKTOP_DATA_DIR, { recursive: true })
  fs.writeFileSync(JWT_SECRET_FILE, secret, { mode: 0o600 })
  return new TextEncoder().encode(secret)
}

export const createUiAuth = ({ password, cookieName = SESSION_COOKIE_NAME, sessionTtlMs = SESSION_TTL_MS } = {}) => {
  const normalizedPassword = normalizePassword(password)

  if (!normalizedPassword) {
    const setSessionCookie = (req, res, token, ttlMs = sessionTtlMs) => {
      const secure = isSecureRequest(req)
      const maxAgeSeconds = Math.floor(ttlMs / 1000)
      const header = buildCookie({
        name: resolveUiSessionCookieName(req, cookieName),
        value: encodeURIComponent(token),
        maxAge: maxAgeSeconds,
        secure,
      })
      res.setHeader("Set-Cookie", header)
    }

    // The logout route is registered whether or not a UI password is, and this branch is the one that has no
    // password: it needs the cookie cleared like the enabled branch does, or the random token `ensureSessionToken`
    // hands out here outlives the sign-out.
    const clearSessionCookieForDisabledAuth = (req, res) => {
      const secure = isSecureRequest(req)
      const header = buildCookie({
        name: resolveUiSessionCookieName(req, cookieName),
        value: "",
        maxAge: 0,
        secure,
      })
      res.setHeader("Set-Cookie", header)
    }

    const ensureSessionToken = async (req, res) => {
      const cookies = parseCookies(req.headers.cookie)
      const name = resolveUiSessionCookieName(req, cookieName)
      if (cookies[name]) {
        return cookies[name]
      }
      const token = crypto.randomBytes(32).toString("base64url")
      setSessionCookie(req, res, token, sessionTtlMs)
      return token
    }

    return {
      enabled: false,
      requireAuth: (_req, _res, next) => next(),
      handleSessionStatus: (_req, res) => {
        res.json({ authenticated: true, disabled: true })
      },
      handleSessionCreate: (_req, res) => {
        res.status(400).json({ error: "UI password not configured" })
      },
      // Every other handler has a stub in this branch; this one was missing while its route is always
      // registered, so signing out answered a TypeError and the cookie stayed.
      handleSessionLogout: (req, res) => {
        clearSessionCookieForDisabledAuth(req, res)
        res.json({ authenticated: false })
      },
      handlePasskeyStatus: (_req, res) => {
        res.json({ enabled: false, hasPasskeys: false, passkeyCount: 0, rpID: null })
      },
      handlePasskeyRegistrationOptions: (_req, res) => {
        res.status(400).json({ error: "UI password not configured" })
      },
      handlePasskeyRegistrationVerify: (_req, res) => {
        res.status(400).json({ error: "UI password not configured" })
      },
      handlePasskeyAuthenticationOptions: (_req, res) => {
        res.status(400).json({ error: "UI password not configured" })
      },
      handlePasskeyAuthenticationVerify: (_req, res) => {
        res.status(400).json({ error: "UI password not configured" })
      },
      handlePasskeyList: (_req, res) => {
        res.json({ passkeys: [] })
      },
      handlePasskeyRevoke: (_req, res) => {
        res.status(400).json({ error: "UI password not configured" })
      },
      handleResetAuth: (_req, res) => {
        res.status(400).json({ error: "UI password not configured" })
      },
      ensureSessionToken,
      dispose: () => {},
    }
  }

  const salt = crypto.randomBytes(16)
  const expectedHash = crypto.scryptSync(normalizedPassword, salt, 64)
  let jwtSecret = getOrCreateJwtSecret()
  let passwordBinding = derivePasswordBinding(normalizedPassword, jwtSecret)
  const resolveSessionTtlMs = (trustDevice) => (trustDevice ? TRUSTED_DEVICE_SESSION_TTL_MS : sessionTtlMs)
  let passkeyController = createUiPasskeys({ passwordBinding })

  const rebuildPasskeyController = () => {
    passkeyController.dispose()
    passwordBinding = derivePasswordBinding(normalizedPassword, jwtSecret)
    passkeyController = createUiPasskeys({ passwordBinding })
  }

  const rotateJwtSecret = () => {
    const nextSecret = crypto.randomBytes(32).toString("hex")
    jwtSecret = persistJwtSecret(nextSecret)
    rebuildPasskeyController()
  }

  const getTokenFromRequest = (req) => {
    const cookies = parseCookies(req.headers.cookie)
    const name = resolveUiSessionCookieName(req, cookieName)
    if (cookies[name]) {
      return cookies[name]
    }
    return null
  }

  const setSessionCookie = (req, res, token, ttlMs) => {
    const secure = isSecureRequest(req)
    const maxAgeSeconds = Math.floor(ttlMs / 1000)
    const header = buildCookie({
      name: resolveUiSessionCookieName(req, cookieName),
      value: encodeURIComponent(token),
      maxAge: maxAgeSeconds,
      secure,
    })
    res.setHeader("Set-Cookie", header)
  }

  const clearSessionCookie = (req, res) => {
    const secure = isSecureRequest(req)
    const header = buildCookie({
      name: resolveUiSessionCookieName(req, cookieName),
      value: "",
      maxAge: 0,
      secure,
    })
    res.setHeader("Set-Cookie", header)
  }

  const verifyPassword = (candidate) => {
    if (!candidate) {
      return false
    }
    const normalizedCandidate = normalizePassword(candidate)
    if (!normalizedCandidate) {
      return false
    }
    try {
      const candidateHash = crypto.scryptSync(normalizedCandidate, salt, 64)
      return crypto.timingSafeEqual(candidateHash, expectedHash)
    } catch {
      return false
    }
  }

  // Runs the whole login-attempt sequence — evaluate the current rate-limit
  // state, verify the password, then record the outcome — as a single
  // critical section per rate-limit key. Holding the lock across all three
  // steps (rather than locking each Map access independently) is what
  // actually prevents a burst of concurrent requests from the same key
  // racing past the attempt cap: with per-step locking, two concurrent
  // callers could both pass the "allowed" check before either recorded its
  // attempt, undercounting failures and letting more than maxAttempts
  // through before lockout engages.
  const attemptLogin = (req, candidate) => {
    const key = getRateLimitKey(req)
    return withRateLimitLock(key, () => {
      const rateLimitResult = evaluateRateLimit(key)
      if (!rateLimitResult.allowed) {
        return { rateLimitResult, outcome: "blocked" }
      }
      if (!verifyPassword(candidate)) {
        markFailedAttempt(key)
        return { rateLimitResult, outcome: "invalid" }
      }
      resetRateLimitRecord(key)
      return { rateLimitResult, outcome: "success" }
    })
  }

  const isSessionValid = async (token) => {
    if (!token) {
      return false
    }
    try {
      const { payload } = await jwtVerify(token, jwtSecret)
      // Tokens issued before sign-out was recorded have no id and stay valid
      // until they expire.
      const tokenId = typeof payload?.jti === "string" ? payload.jti : ""
      if (tokenId && revokedSessionIds.has(tokenId)) {
        return false
      }
      return true
    } catch {
      return false
    }
  }

  const issueSession = async (req, res, { trustDevice = false } = {}) => {
    const ttlMs = resolveSessionTtlMs(trustDevice)
    const token = await new SignJWT({ type: "ui-session" })
      .setProtectedHeader({ alg: "HS256" })
      .setJti(crypto.randomBytes(16).toString("base64url"))
      .setIssuedAt()
      .setExpirationTime(ttlMs / 1000 + "s")
      .sign(jwtSecret)
    setSessionCookie(req, res, token, ttlMs)
    return token
  }

  startRateLimitCleanup()

  const respondUnauthorized = (req, res) => {
    res.status(401)
    const acceptsJson = req.headers.accept?.includes("application/json")
    // `req.path` is relative to the mount point inside a mounted middleware: under `app.use("/api", …)` it is
    // "/sessions", never "/api/sessions", so the API branch never ran and an API client that sends the default
    // `Accept: */*` got text/plain. The full request URL is what the test has to use.
    const requestUrl = typeof req.originalUrl === "string" ? req.originalUrl : req.path
    if (acceptsJson || requestUrl.startsWith("/api")) {
      res.json({ error: "UI authentication required", locked: true })
    } else {
      res.type("text/plain").send("Authentication required")
    }
  }

  const requireAuth = async (req, res, next) => {
    if (req.method === "OPTIONS") {
      return next()
    }
    const token = getTokenFromRequest(req)
    if (await isSessionValid(token)) {
      return next()
    }
    clearSessionCookie(req, res)
    return respondUnauthorized(req, res)
  }

  const handleSessionStatus = async (req, res) => {
    const token = getTokenFromRequest(req)
    if (await isSessionValid(token)) {
      res.json({ authenticated: true })
      return
    }
    clearSessionCookie(req, res)
    res.status(401).json({ authenticated: false, locked: true })
  }

  const handleSessionCreate = async (req, res) => {
    const candidate = typeof req.body?.password === "string" ? req.body.password : ""
    const { rateLimitResult, outcome } = await attemptLogin(req, candidate)

    res.setHeader("X-RateLimit-Limit", rateLimitResult.limit)
    res.setHeader("X-RateLimit-Remaining", rateLimitResult.remaining)
    res.setHeader("X-RateLimit-Reset", rateLimitResult.reset)

    if (outcome === "blocked") {
      res.setHeader("Retry-After", rateLimitResult.retryAfter)
      res.status(429).json({
        error: "Too many login attempts, please try again later",
        retryAfter: rateLimitResult.retryAfter,
      })
      return
    }

    if (outcome === "invalid") {
      clearSessionCookie(req, res)
      res.status(401).json({ error: "Invalid credentials" })
      return
    }

    await issueSession(req, res, {
      trustDevice: isTrustedDeviceRequest(req.body?.trustDevice),
    })
    res.json({ authenticated: true })
  }

  const respondPasskeyError = (res, error) => {
    const statusCode = typeof error?.statusCode === "number" ? error.statusCode : 400
    res.status(statusCode).json({ error: error?.message || "Passkey request failed" })
  }

  const handlePasskeyStatus = (req, res) => {
    try {
      res.json(passkeyController.getStatus(req))
    } catch (error) {
      respondPasskeyError(res, error)
    }
  }

  const handlePasskeyRegistrationOptions = async (req, res) => {
    try {
      const label = typeof req.body?.label === "string" ? req.body.label : ""
      const options = await passkeyController.beginRegistration(req, { label })
      res.json(options)
    } catch (error) {
      respondPasskeyError(res, error)
    }
  }

  const handlePasskeyRegistrationVerify = async (req, res) => {
    try {
      const result = await passkeyController.finishRegistration(req.body)
      res.json(result)
    } catch (error) {
      respondPasskeyError(res, error)
    }
  }

  const handlePasskeyAuthenticationOptions = async (req, res) => {
    try {
      const options = await passkeyController.beginAuthentication(req)
      res.json(options)
    } catch (error) {
      respondPasskeyError(res, error)
    }
  }

  const handlePasskeyAuthenticationVerify = async (req, res) => {
    try {
      await passkeyController.finishAuthentication(req.body)
      await issueSession(req, res, {
        trustDevice: isTrustedDeviceRequest(req.body?.trustDevice),
      })
      res.json({ authenticated: true })
    } catch (error) {
      respondPasskeyError(res, error)
    }
  }

  const handlePasskeyList = (req, res) => {
    try {
      res.json({ passkeys: passkeyController.listPasskeys(req) })
    } catch (error) {
      respondPasskeyError(res, error)
    }
  }

  const handlePasskeyRevoke = async (req, res) => {
    try {
      // Awaited: the store mutation is serialized behind the other passkey mutations (see ui-passkeys).
      const result = await passkeyController.revokePasskey(req, req.params?.id)
      res.json(result)
    } catch (error) {
      respondPasskeyError(res, error)
    }
  }

  /**
   * Sign out: clear the cookie and revoke the presented token so a copy of it
   * cannot be replayed before its own expiry. Deliberately not behind
   * requireAuth — a caller with an expired session must still be able to clear
   * its cookie.
   */
  const handleSessionLogout = async (req, res) => {
    const token = getTokenFromRequest(req)
    if (token) {
      try {
        const { payload } = await jwtVerify(token, jwtSecret)
        const tokenId = typeof payload?.jti === "string" ? payload.jti : ""
        if (tokenId) {
          if (revokedSessionIds.size >= REVOKED_SESSION_MAX) {
            const oldest = revokedSessionIds.values().next().value
            if (oldest !== undefined) {
              revokedSessionIds.delete(oldest)
            }
          }
          revokedSessionIds.add(tokenId)
        }
      } catch {
        // An expired or malformed token has nothing to revoke.
      }
    }

    clearSessionCookie(req, res)
    res.json({ authenticated: false })
  }

  const handleResetAuth = async (req, res) => {
    try {
      // Refuse before destroying anything. When the JWT secret is pinned via env,
      // rotateJwtSecret() -> persistJwtSecret() throws a 400, but clearAllPasskeys()
      // already persisted an empty store to disk — permanently deleting every
      // passkey while the reset itself failed and sessions stayed valid. Guard the
      // env-pinned case up front so no passkey is cleared unless the reset can
      // actually complete. (persistJwtSecret keeps the same check as defense in depth.)
      //
      // The predicate is the one signing uses, not "is the variable set": a secret that is too
      // short is ignored there, the file secret is what protects the sessions, and refusing on the
      // variable alone blocked a sign-out that could complete and left those sessions valid.
      if (resolveEnvJwtSecret()) {
        const error = new Error("Global sign-out is unavailable while AX_CODE_JWT_SECRET is set")
        error.statusCode = 400
        throw error
      }
      const passkeyResult = await passkeyController.clearAllPasskeys()
      rotateJwtSecret()
      clearSessionCookie(req, res)
      res.json({
        cleared: true,
        clearedPasskeys: passkeyResult.clearedCount,
        signedOutEverywhere: true,
      })
    } catch (error) {
      respondPasskeyError(res, error)
    }
  }

  const dispose = () => {
    loginRateLimiter.clear()
    stopRateLimitCleanup()
    passkeyController.dispose()
  }

  return {
    enabled: true,
    requireAuth,
    handleSessionStatus,
    handleSessionCreate,
    handleSessionLogout,
    handlePasskeyStatus,
    handlePasskeyRegistrationOptions,
    handlePasskeyRegistrationVerify,
    handlePasskeyAuthenticationOptions,
    handlePasskeyAuthenticationVerify,
    handlePasskeyList,
    handlePasskeyRevoke,
    handleResetAuth,
    ensureSessionToken: async (req, _res) => {
      const token = getTokenFromRequest(req)
      return (await isSessionValid(token)) ? token : null
    },
    dispose,
  }
}
