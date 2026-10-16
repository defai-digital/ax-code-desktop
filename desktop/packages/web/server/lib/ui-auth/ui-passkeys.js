import crypto from "crypto"
import fs from "fs"
import os from "os"
import path from "path"
import {
  generateAuthenticationOptions,
  generateRegistrationOptions,
  verifyAuthenticationResponse,
  verifyRegistrationResponse,
} from "@simplewebauthn/server"
import { getRequestOrigin, getRequestRpId } from "../security/request-origin.js"
import { isLoopbackHostname, normalizeLoopbackHttpOrigin } from "../security/local-only.js"

const DEFAULT_STORE_VERSION = 1
const DEFAULT_CHALLENGE_TTL_MS = 5 * 60 * 1000
const DEFAULT_RP_NAME = "AX Code"

const AX_CODE_DESKTOP_DATA_DIR = process.env.AX_CODE_DESKTOP_DATA_DIR
  ? path.resolve(process.env.AX_CODE_DESKTOP_DATA_DIR)
  : path.join(os.homedir(), ".config", "openchamber")

const PASSKEY_STORE_FILE = path.join(AX_CODE_DESKTOP_DATA_DIR, "ui-passkeys.json")

const createUserId = () => crypto.randomBytes(32).toString("base64url")
const asTrimmedString = (value) => (typeof value === "string" ? value.trim() : "")

const decodeUserId = (value) => {
  if (typeof value !== "string" || !value) {
    return null
  }

  try {
    return Uint8Array.from(Buffer.from(value, "base64url"))
  } catch {
    return null
  }
}

const normalizeLabel = (value, fallback) => {
  if (typeof value !== "string") {
    return fallback
  }
  const normalized = value.trim().replace(/\s+/g, " ")
  return normalized ? normalized.slice(0, 120) : fallback
}

const isLocalRpId = (rpID) => isLoopbackHostname(rpID)

const parseStoredPasskey = (record) => {
  if (!record || typeof record !== "object") {
    return null
  }

  if (typeof record.id !== "string" || typeof record.publicKey !== "string" || typeof record.rpID !== "string") {
    return null
  }

  return {
    id: record.id,
    publicKey: record.publicKey,
    counter: typeof record.counter === "number" && Number.isFinite(record.counter) ? record.counter : 0,
    transports: Array.isArray(record.transports) ? record.transports.filter((value) => typeof value === "string") : [],
    deviceType: typeof record.deviceType === "string" ? record.deviceType : "singleDevice",
    backedUp: record.backedUp === true,
    createdAt: typeof record.createdAt === "number" ? record.createdAt : Date.now(),
    lastUsedAt: typeof record.lastUsedAt === "number" ? record.lastUsedAt : null,
    label: normalizeLabel(record.label, "Unnamed device"),
    rpID: record.rpID,
  }
}

export const createUiPasskeys = ({
  passwordBinding,
  storeFile = PASSKEY_STORE_FILE,
  rpName = DEFAULT_RP_NAME,
  challengeTtlMs = DEFAULT_CHALLENGE_TTL_MS,
} = {}) => {
  const registrationChallenges = new Map()
  const authenticationChallenges = new Map()

  // Every mutation below is a load → (sometimes await) → persist cycle over the same JSON store, and
  // `persistStore` replaces the whole passkey list. The registration flow awaits the WebAuthn
  // verification in the middle, so a revoke that landed in that window was overwritten by the
  // registration's older snapshot: the credential the user had just revoked came back, and the device
  // could sign in again. The reverse order lost the new credential. Mutations run one at a time, as the
  // login rate limiter in ui-auth.js does.
  let mutationTail = Promise.resolve()
  const withStoreMutationLock = (fn) => {
    const result = mutationTail.then(fn, fn)
    mutationTail = result.then(
      () => {},
      () => {},
    )
    return result
  }
  const runLocked = (fn) => withStoreMutationLock(() => fn())

  const ensureStoreDirectory = () => {
    const storeDirectory = path.dirname(storeFile)
    fs.mkdirSync(storeDirectory, { recursive: true, mode: 0o700 })
    try {
      fs.chmodSync(storeDirectory, 0o700)
    } catch {}
    return storeDirectory
  }

  const persistStore = (store) => {
    const storeDirectory = ensureStoreDirectory()
    const tmpFile = path.join(
      storeDirectory,
      `.ui-passkeys.${process.pid}.${Date.now()}.${crypto.randomBytes(6).toString("hex")}.tmp`,
    )

    try {
      fs.writeFileSync(tmpFile, `${JSON.stringify(store, null, 2)}\n`, { encoding: "utf8", mode: 0o600 })
      try {
        fs.chmodSync(tmpFile, 0o600)
      } catch {}
      fs.renameSync(tmpFile, storeFile)
      try {
        fs.chmodSync(storeFile, 0o600)
      } catch {}
    } catch (error) {
      try {
        fs.rmSync(tmpFile, { force: true })
      } catch {}
      throw error
    }
  }

  const createEmptyStore = () => ({
    version: DEFAULT_STORE_VERSION,
    userID: createUserId(),
    passwordBinding,
    passkeys: [],
  })

  const loadStore = () => {
    let store = createEmptyStore()
    let shouldPersistInitialStore = false

    try {
      const raw = fs.readFileSync(storeFile, "utf8")
      const parsed = JSON.parse(raw)
      store = {
        version: DEFAULT_STORE_VERSION,
        userID: decodeUserId(parsed?.userID) ? parsed.userID : store.userID,
        passwordBinding: typeof parsed?.passwordBinding === "string" ? parsed.passwordBinding : "",
        passkeys: Array.isArray(parsed?.passkeys) ? parsed.passkeys.map(parseStoredPasskey).filter(Boolean) : [],
      }
    } catch (error) {
      if (error?.code === "ENOENT") {
        shouldPersistInitialStore = true
      } else {
        console.warn("[UI Passkeys] Failed to read passkey store:", error?.message || error)
      }
    }

    if (!passwordBinding) {
      if (store.passkeys.length > 0 || store.passwordBinding) {
        store = { ...store, passkeys: [], passwordBinding: "" }
        persistStore(store)
      }
      return store
    }

    if (store.passwordBinding !== passwordBinding) {
      store = {
        version: DEFAULT_STORE_VERSION,
        userID: store.userID || createUserId(),
        passwordBinding,
        passkeys: [],
      }
      persistStore(store)
      return store
    }

    if (shouldPersistInitialStore) {
      persistStore(store)
    }

    return store
  }

  const cleanupChallengeMap = (map) => {
    const now = Date.now()
    for (const [requestId, record] of map.entries()) {
      if (!record || now >= record.expiresAt) {
        map.delete(requestId)
      }
    }
  }

  const buildOriginCandidates = async (req) => {
    const origins = new Set()
    const currentOrigin = normalizeLoopbackHttpOrigin(getRequestOrigin(req))
    if (currentOrigin) {
      origins.add(currentOrigin)
    }

    return Array.from(origins)
  }

  const assertEnabled = () => {
    if (!passwordBinding) {
      const error = new Error("Passkeys require UI password protection to be enabled")
      error.statusCode = 400
      throw error
    }
  }

  const getPasskeysForRpId = (store, rpID) => store.passkeys.filter((passkey) => passkey.rpID === rpID)
  const getLocalRpId = (req) => {
    const rpID = getRequestRpId(req)
    return isLocalRpId(rpID) ? rpID : ""
  }

  const getStatus = (req) => {
    const store = loadStore()
    const rpID = getLocalRpId(req)
    return {
      enabled: Boolean(passwordBinding),
      hasPasskeys: Boolean(rpID) && getPasskeysForRpId(store, rpID).length > 0,
      passkeyCount: Boolean(rpID) ? getPasskeysForRpId(store, rpID).length : 0,
      rpID,
    }
  }

  const listPasskeys = (req) => {
    assertEnabled()

    const store = loadStore()
    const rpID = getLocalRpId(req)
    if (!rpID) {
      return []
    }

    return getPasskeysForRpId(store, rpID).map((passkey) => ({
      id: passkey.id,
      label: passkey.label,
      createdAt: passkey.createdAt,
      lastUsedAt: passkey.lastUsedAt,
      deviceType: passkey.deviceType,
      backedUp: passkey.backedUp,
    }))
  }

  const revokePasskey = (req, passkeyId) =>
    runLocked(() => revokePasskeyUnlocked(req, passkeyId))

  const revokePasskeyUnlocked = (req, passkeyId) => {
    assertEnabled()

    const normalizedPasskeyId = asTrimmedString(passkeyId)
    if (!normalizedPasskeyId) {
      const error = new Error("Passkey ID is required")
      error.statusCode = 400
      throw error
    }

    const store = loadStore()
    const rpID = getLocalRpId(req)
    const existingPasskey = store.passkeys.find(
      (passkey) => passkey.id === normalizedPasskeyId && passkey.rpID === rpID,
    )

    if (!existingPasskey) {
      const error = new Error("Passkey not found for this host")
      error.statusCode = 404
      throw error
    }

    const nextPasskeys = store.passkeys.filter(
      (passkey) => !(passkey.id === normalizedPasskeyId && passkey.rpID === rpID),
    )
    persistStore({
      ...store,
      passwordBinding,
      passkeys: nextPasskeys,
    })

    return {
      revoked: true,
      passkeyCount: nextPasskeys.filter((passkey) => passkey.rpID === rpID).length,
    }
  }

  const clearAllPasskeys = () => runLocked(clearAllPasskeysUnlocked)

  const clearAllPasskeysUnlocked = () => {
    assertEnabled()

    const store = loadStore()
    const clearedCount = store.passkeys.length
    persistStore({
      ...store,
      userID: crypto.randomBytes(32).toString("base64url"),
      passwordBinding,
      passkeys: [],
    })

    return {
      cleared: true,
      clearedCount,
    }
  }

  const beginRegistration = async (req, { label } = {}) => {
    assertEnabled()
    cleanupChallengeMap(registrationChallenges)

    const rpID = getLocalRpId(req)
    if (!rpID) {
      const error = new Error("Unable to resolve a valid passkey host for this request")
      error.statusCode = 400
      throw error
    }

    const currentOrigin = getRequestOrigin(req)
    if (!normalizeLoopbackHttpOrigin(currentOrigin)) {
      const error = new Error("Unable to resolve a valid passkey origin for this request")
      error.statusCode = 400
      throw error
    }

    const store = loadStore()
    const userID = decodeUserId(store.userID)
    if (!userID) {
      const error = new Error("Passkey storage is invalid. Please try again.")
      error.statusCode = 500
      throw error
    }

    const options = await generateRegistrationOptions({
      rpName,
      rpID,
      userID,
      userName: "openchamber-ui",
      userDisplayName: "AX Code UI",
      attestationType: "none",
      excludeCredentials: getPasskeysForRpId(store, rpID).map((passkey) => ({
        id: passkey.id,
        transports: passkey.transports,
      })),
      authenticatorSelection: {
        residentKey: "required",
        userVerification: "required",
      },
    })

    const requestId = crypto.randomBytes(16).toString("base64url")
    registrationChallenges.set(requestId, {
      challenge: options.challenge,
      expectedOrigins: await buildOriginCandidates(req),
      expectedRPIDs: [rpID],
      rpID,
      label: normalizeLabel(label, "This device"),
      createdAt: Date.now(),
      expiresAt: Date.now() + challengeTtlMs,
    })

    return {
      requestId,
      optionsJSON: options,
    }
  }

  const finishRegistration = (payload) => runLocked(() => finishRegistrationUnlocked(payload))

  const finishRegistrationUnlocked = async (payload) => {
    assertEnabled()
    cleanupChallengeMap(registrationChallenges)

    let store = loadStore()
    const requestId = typeof payload?.requestId === "string" ? payload.requestId : ""
    const response = payload?.response

    const matchingRecord = requestId ? registrationChallenges.get(requestId) : null
    if (!matchingRecord) {
      const error = new Error("Passkey setup has expired. Please try again.")
      error.statusCode = 400
      throw error
    }

    registrationChallenges.delete(requestId)

    const verification = await verifyRegistrationResponse({
      response,
      expectedChallenge: matchingRecord.challenge,
      expectedOrigin: matchingRecord.expectedOrigins,
      expectedRPID: matchingRecord.expectedRPIDs,
      requireUserVerification: true,
    })

    if (!verification.verified || !verification.registrationInfo) {
      const error = new Error("Passkey registration could not be verified")
      error.statusCode = 400
      throw error
    }

    const { credential, credentialDeviceType, credentialBackedUp } = verification.registrationInfo

    // Re-read: this ran across an await, and a plain read helper can also reset the store (a changed
    // password binding clears it). The new credential is added to whatever the store holds now.
    store = loadStore()

    const nextPasskeys = store.passkeys.filter((passkey) => passkey.id !== credential.id)
    nextPasskeys.push({
      id: credential.id,
      publicKey: Buffer.from(credential.publicKey).toString("base64url"),
      counter: credential.counter,
      transports: Array.isArray(credential.transports)
        ? credential.transports.filter((value) => typeof value === "string")
        : [],
      deviceType: credentialDeviceType,
      backedUp: credentialBackedUp,
      createdAt: Date.now(),
      lastUsedAt: null,
      label: matchingRecord.label,
      rpID: matchingRecord.rpID,
    })

    persistStore({
      ...store,
      passwordBinding,
      passkeys: nextPasskeys,
    })

    return {
      verified: true,
      passkeyCount: nextPasskeys.filter((passkey) => passkey.rpID === matchingRecord.rpID).length,
    }
  }

  const beginAuthentication = async (req) => {
    assertEnabled()
    cleanupChallengeMap(authenticationChallenges)

    const store = loadStore()
    const rpID = getLocalRpId(req)
    const passkeys = getPasskeysForRpId(store, rpID)

    if (!rpID || passkeys.length === 0) {
      const error = new Error("No passkeys are registered for this host yet")
      error.statusCode = 404
      throw error
    }

    const options = await generateAuthenticationOptions({
      rpID,
      userVerification: "required",
      allowCredentials: passkeys.map((passkey) => ({
        id: passkey.id,
        transports: passkey.transports,
      })),
    })

    const requestId = crypto.randomBytes(16).toString("base64url")
    authenticationChallenges.set(requestId, {
      challenge: options.challenge,
      expectedOrigins: await buildOriginCandidates(req),
      expectedRPIDs: [rpID],
      createdAt: Date.now(),
      expiresAt: Date.now() + challengeTtlMs,
    })

    return {
      requestId,
      optionsJSON: options,
    }
  }

  const finishAuthentication = (payload) => runLocked(() => finishAuthenticationUnlocked(payload))

  const finishAuthenticationUnlocked = async (payload) => {
    assertEnabled()
    cleanupChallengeMap(authenticationChallenges)

    const requestId = typeof payload?.requestId === "string" ? payload.requestId : ""

    // Consume the challenge first. Looking the credential up before this point
    // left the challenge reusable after a rejected attempt, and answering
    // "unknown credential" while it stayed alive turned the endpoint into a
    // credential-existence oracle.
    const matchingRecord = requestId ? authenticationChallenges.get(requestId) : null
    if (!matchingRecord) {
      const error = new Error("Passkey sign-in has expired. Please try again.")
      error.statusCode = 400
      throw error
    }

    authenticationChallenges.delete(requestId)

    const response = payload?.response
    let store = loadStore()
    const passkey = store.passkeys.find((item) => item.id === response?.id)

    if (!passkey) {
      const error = new Error("That passkey is not registered for this AX Code instance")
      error.statusCode = 404
      throw error
    }

    const verification = await verifyAuthenticationResponse({
      response,
      expectedChallenge: matchingRecord.challenge,
      expectedOrigin: matchingRecord.expectedOrigins,
      expectedRPID: matchingRecord.expectedRPIDs,
      credential: {
        id: passkey.id,
        publicKey: Buffer.from(passkey.publicKey, "base64url"),
        counter: passkey.counter,
        transports: passkey.transports,
      },
      requireUserVerification: true,
    })

    if (!verification.verified || !verification.authenticationInfo) {
      const error = new Error("Passkey sign-in could not be verified")
      error.statusCode = 400
      throw error
    }

    // Re-read: this ran across an await, and `persistStore` replaces the whole list. Writing the
    // snapshot read before the verification back resurrected a credential revoked in that window (and
    // dropped one registered in it), which is why the other mutations hold this lock too.
    store = loadStore()
    const current = store.passkeys.find((item) => item.id === response?.id)
    if (current) {
      const nextPasskeys = store.passkeys.map((item) =>
        item.id === current.id
          ? {
              ...item,
              counter: verification.authenticationInfo.newCounter,
              lastUsedAt: Date.now(),
            }
          : item,
      )

      persistStore({
        ...store,
        passwordBinding,
        passkeys: nextPasskeys,
      })
    }

    // The credential was revoked while it was being verified: the sign-in itself succeeded, and
    // nothing is written back for it.
    return { verified: true }
  }

  const dispose = () => {
    registrationChallenges.clear()
    authenticationChallenges.clear()
  }

  return {
    enabled: Boolean(passwordBinding),
    getStatus,
    listPasskeys,
    revokePasskey,
    clearAllPasskeys,
    beginRegistration,
    finishRegistration,
    beginAuthentication,
    finishAuthentication,
    dispose,
    isLocalRpId,
  }
}
