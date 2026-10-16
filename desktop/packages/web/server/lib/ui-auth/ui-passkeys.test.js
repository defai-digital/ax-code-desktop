import fs from "fs"
import os from "os"
import path from "path"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

vi.mock("@simplewebauthn/server", () => ({
  generateAuthenticationOptions: vi.fn(async () => ({ challenge: "auth-challenge" })),
  generateRegistrationOptions: vi.fn(async () => ({ challenge: "registration-challenge" })),
  verifyAuthenticationResponse: vi.fn(async () => ({
    verified: true,
    authenticationInfo: { newCounter: 2 },
  })),
  verifyRegistrationResponse: vi.fn(async () => ({
    verified: true,
    registrationInfo: {
      credential: {
        id: "credential-id",
        publicKey: Uint8Array.from([1, 2, 3]),
        counter: 1,
        transports: ["internal"],
      },
      credentialDeviceType: "singleDevice",
      credentialBackedUp: false,
    },
  })),
}))

const simpleWebAuthn = await import("@simplewebauthn/server")
const { createUiPasskeys } = await import("./ui-passkeys.js")
const { createMockRequest } = await import("../../test-helpers/route-harness.js")

describe("ui passkeys", () => {
  let tempRoot
  let storeFile

  beforeEach(() => {
    tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), "ax-code-ui-passkeys-"))
    storeFile = path.join(tempRoot, "ui-passkeys.json")
    vi.clearAllMocks()
  })

  afterEach(() => {
    fs.rmSync(tempRoot, { recursive: true, force: true })
  })

  it("stores passkeys in a private directory and file", () => {
    if (process.platform === "win32") {
      return
    }

    storeFile = path.join(tempRoot, "nested", "ui-passkeys.json")
    const passkeys = createUiPasskeys({
      passwordBinding: "password-binding",
      storeFile,
    })

    passkeys.getStatus(createMockRequest({ host: "localhost:3000" }))

    expect(fs.statSync(path.dirname(storeFile)).mode & 0o777).toBe(0o700)
    expect(fs.statSync(storeFile).mode & 0o777).toBe(0o600)
  })

  it("loads an existing passkey store without a preflight existence check", () => {
    const stored = {
      version: 1,
      userID: Buffer.from("user").toString("base64url"),
      passwordBinding: "password-binding",
      passkeys: [
        {
          id: "credential-id",
          publicKey: Buffer.from([1, 2, 3]).toString("base64url"),
          counter: 1,
          transports: ["internal"],
          deviceType: "singleDevice",
          backedUp: false,
          createdAt: 1,
          lastUsedAt: null,
          label: "Laptop",
          rpID: "localhost",
        },
      ],
    }
    fs.writeFileSync(storeFile, `${JSON.stringify(stored, null, 2)}\n`, "utf8")
    const existsSync = vi.spyOn(fs, "existsSync").mockImplementation((candidate) => {
      if (candidate === storeFile) {
        return false
      }
      return false
    })
    const passkeys = createUiPasskeys({
      passwordBinding: "password-binding",
      storeFile,
    })

    try {
      expect(passkeys.listPasskeys(createMockRequest({ host: "localhost:3000" }))).toEqual([
        {
          id: "credential-id",
          label: "Laptop",
          createdAt: 1,
          lastUsedAt: null,
          deviceType: "singleDevice",
          backedUp: false,
        },
      ])
      expect(JSON.parse(fs.readFileSync(storeFile, "utf8"))).toEqual(stored)
    } finally {
      existsSync.mockRestore()
    }
  })

  it("normalizes request origins before WebAuthn verification", async () => {
    const passkeys = createUiPasskeys({
      passwordBinding: "password-binding",
      storeFile,
    })

    const registration = await passkeys.beginRegistration(createMockRequest({ host: "LOCALHOST:3000" }))
    await passkeys.finishRegistration({
      requestId: registration.requestId,
      response: { id: "credential-id" },
    })

    expect(simpleWebAuthn.verifyRegistrationResponse).toHaveBeenCalledWith(
      expect.objectContaining({
        expectedOrigin: ["http://localhost:3000"],
        expectedRPID: ["localhost"],
      }),
    )
  })

  it("ignores forwarded host and protocol for WebAuthn expectations", async () => {
    const passkeys = createUiPasskeys({
      passwordBinding: "password-binding",
      storeFile,
    })

    const registration = await passkeys.beginRegistration(
      createMockRequest({
        host: "localhost:3902",
        forwardedHost: "desktop.example.com",
        forwardedProto: "https",
      }),
    )
    await passkeys.finishRegistration({
      requestId: registration.requestId,
      response: { id: "credential-id" },
    })

    expect(simpleWebAuthn.verifyRegistrationResponse).toHaveBeenCalledWith(
      expect.objectContaining({
        expectedOrigin: ["http://localhost:3902"],
        expectedRPID: ["localhost"],
      }),
    )
  })

  it("rejects non-loopback passkey hosts even when forwarded headers claim localhost", async () => {
    const passkeys = createUiPasskeys({
      passwordBinding: "password-binding",
      storeFile,
    })

    await expect(
      passkeys.beginRegistration(
        createMockRequest({
          host: "desktop.example.com",
          forwardedHost: "localhost:3902",
          forwardedProto: "http",
        }),
      ),
    ).rejects.toThrow("valid passkey host")
  })

  it("consumes the authentication challenge even when the credential is unknown", async () => {
    const passkeys = createUiPasskeys({ passwordBinding: "password-binding", storeFile })
    const req = createMockRequest({ host: "localhost:3000" })

    const registration = await passkeys.beginRegistration(req)
    await passkeys.finishRegistration({ requestId: registration.requestId, response: { id: "credential-id" } })

    const authentication = await passkeys.beginAuthentication(req)

    // A probe with an unregistered credential id must not leave the challenge
    // reusable (it used to 404 before consuming it), and the retry must be
    // rejected as expired rather than reaching verification.
    await expect(
      passkeys.finishAuthentication({
        requestId: authentication.requestId,
        response: { id: "not-registered" },
      }),
    ).rejects.toMatchObject({ statusCode: 404 })

    await expect(
      passkeys.finishAuthentication({
        requestId: authentication.requestId,
        response: { id: "credential-id" },
      }),
    ).rejects.toMatchObject({ statusCode: 400 })

    expect(simpleWebAuthn.verifyAuthenticationResponse).not.toHaveBeenCalled()
  })

  it("does not resurrect a revoked passkey when a registration verifies in parallel", async () => {
    // The registration awaits the WebAuthn verification between its read and its write, and the write
    // replaces the whole list: a revoke that landed in that window was overwritten by the older
    // snapshot, and the credential the user had just removed could sign in again.
    const passkeys = createUiPasskeys({ passwordBinding: "password-binding", storeFile })
    const req = createMockRequest({ host: "localhost:3000" })

    const first = await passkeys.beginRegistration(req, { label: "first" })
    await passkeys.finishRegistration({ requestId: first.requestId, response: { id: "first-id" } })

    simpleWebAuthn.verifyRegistrationResponse.mockImplementationOnce(
      () =>
        new Promise((resolve) =>
          setTimeout(
            () =>
              resolve({
                verified: true,
                registrationInfo: {
                  credential: {
                    id: "second-id",
                    publicKey: Uint8Array.from([1, 2, 3]),
                    counter: 1,
                    transports: ["internal"],
                  },
                  credentialDeviceType: "singleDevice",
                  credentialBackedUp: false,
                },
              }),
            20,
          ),
        ),
    )

    const second = await passkeys.beginRegistration(req, { label: "second" })
    const registering = passkeys.finishRegistration({ requestId: second.requestId, response: { id: "second-id" } })
    // The mocked verification issues "credential-id" for the first registration.
    await passkeys.revokePasskey(req, "credential-id")
    await registering

    const stored = JSON.parse(fs.readFileSync(storeFile, "utf8"))
    expect(stored.passkeys.map((passkey) => passkey.id)).toEqual(["second-id"])
  })

  it("trims passkey ids before revoking them", async () => {
    const passkeys = createUiPasskeys({
      passwordBinding: "password-binding",
      storeFile,
    })
    const req = createMockRequest({ host: "localhost:3000" })

    const registration = await passkeys.beginRegistration(req)
    await passkeys.finishRegistration({
      requestId: registration.requestId,
      response: { id: "credential-id" },
    })

    // The mutation is serialized behind the other store mutations, so it is awaited.
    await expect(passkeys.revokePasskey(req, " credential-id ")).resolves.toMatchObject({
      revoked: true,
      passkeyCount: 0,
    })
    expect(passkeys.listPasskeys(req)).toEqual([])
  })
})
