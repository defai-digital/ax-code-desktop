import { test } from "vitest"
import assert from "node:assert/strict"
import crypto from "node:crypto"
import { handle } from "../.internal/deploy/multipart-worker.mjs"
const payload = Buffer.from("qualified bytes"),
  sha = crypto.createHash("sha256").update(payload).digest("hex")
const manifest = { key: { size: payload.length, parts: [{ size: payload.length, sha256: sha }] } }
const calls = []
let existing = false
const upload = {
  uploadId: "test-upload",
  async uploadPart(n, b) {
    calls.push(["part", n, Buffer.from(b).toString()])
    return { partNumber: n, etag: "qualified-etag" }
  },
  async complete(p) {
    calls.push(["complete", p])
    return { size: payload.length }
  },
  async abort() {
    calls.push(["abort"])
  },
}
const env = {
  UPLOAD_TOKEN: "test-only-capability",
  BUCKET: {
    async head() {
      return existing ? {} : null
    },
    async createMultipartUpload(key) {
      calls.push(["create", key])
      return upload
    },
    resumeMultipartUpload(key, id) {
      assert.equal(key, "key")
      assert.equal(id, "test-upload")
      return upload
    },
  },
}
const req = (action, { token = env.UPLOAD_TOKEN, key = "key", body, id = "test-upload", part = 1 } = {}) =>
  new Request("https://test.invalid/" + action + "?key=" + key + "&id=" + id + "&part=" + part, {
    method: "POST",
    body,
    headers: {
      Authorization: "Bearer " + token,
      ...(body ? { "Content-Length": String(Buffer.byteLength(body)) } : {}),
    },
  })
test("reject unauthenticated and unqualified keys without R2 operations", async () => {
  const before = calls.length
  assert.equal((await handle(req("create", { token: "wrong" }), env, manifest)).status, 401)
  assert.equal((await handle(req("create", { key: "unqualified" }), env, manifest)).status, 403)
  assert.equal(calls.length, before)
})
test("create, validate bytes and complete native R2 multipart upload", async () => {
  assert.equal((await handle(req("create"), env, manifest)).status, 200)
  const response = await handle(req("part", { body: payload }), env, manifest)
  assert.deepEqual(await response.json(), { partNumber: 1, etag: "qualified-etag" })
  assert.equal(
    (
      await handle(
        req("complete", { body: JSON.stringify([{ partNumber: 1, etag: "qualified-etag" }]) }),
        env,
        manifest,
      )
    ).status,
    200,
  )
})
test("reject same-sized corrupt bytes, wrong part index and invalid completion", async () => {
  assert.equal((await handle(req("part", { body: Buffer.from("corrupted bytes") }), env, manifest)).status, 400)
  assert.equal((await handle(req("part", { body: payload, part: 2 }), env, manifest)).status, 400)
  assert.equal((await handle(req("complete", { body: "[]" }), env, manifest)).status, 400)
})
test("refuse immutable collision at creation and completion", async () => {
  existing = true
  assert.equal((await handle(req("create"), env, manifest)).status, 409)
  assert.equal(
    (
      await handle(
        req("complete", { body: JSON.stringify([{ partNumber: 1, etag: "qualified-etag" }]) }),
        env,
        manifest,
      )
    ).status,
    409,
  )
  existing = false
})
test("abort owns its exact key and upload ID", async () => {
  assert.equal((await handle(req("abort"), env, manifest)).status, 200)
  assert.deepEqual(calls.at(-1), ["abort"])
})

test("staging requires signed qualification before credentials or Cloudflare access", async () => {
  const { stageMultipart } = await import("../.internal/deploy/multipart.mjs")
  await assert.rejects(stageMultipart("/nonexistent/desktop-release", "/nonexistent/qualification.json"), /ENOENT/)
})

test("active multipart updates require a public gateway and staging still requires a disabled one", async () => {
  const { assertMultipartGateway } = await import("../.internal/deploy/multipart.mjs")
  await assertMultipartGateway(new Response("installer"), "upload")
  await assert.rejects(assertMultipartGateway(new Response("disabled", { status: 503 }), "upload"), /active/)
  await assert.rejects(assertMultipartGateway(new Response("installer"), "stage"), /disabled/)
  await assertMultipartGateway(new Response("Desktop public release is not enabled", { status: 503 }), "stage")
})

test("multipart publication proves every immutable byte before advancing aliases or latest", async () => {
  const { publishMultipartObjects } = await import("../.internal/deploy/multipart.mjs")
  const objects = [
    { key: "version/installer", mutable: false },
    { key: "version/ready", mutable: false },
    { key: "install.minisig", mutable: true },
    { key: "install", mutable: true },
    { key: "latest.txt.minisig", mutable: true },
    { key: "latest.txt", mutable: true },
  ]
  const calls = []
  await publishMultipartObjects(
    objects,
    {
      stageObject: async (object) => calls.push("stage:" + object.key),
      publishAlias: async (object) => calls.push("alias:" + object.key),
      verifyObjects: async (selected, publicServing) => calls.push(`verify:${publicServing}:${selected.length}`),
    },
    "upload",
  )
  assert.deepEqual(calls, [
    "stage:version/installer",
    "stage:version/ready",
    "verify:false:2",
    "verify:true:2",
    "alias:install.minisig",
    "alias:install",
    "alias:latest.txt.minisig",
    "alias:latest.txt",
    "verify:true:6",
  ])
  const aliases = []
  await assert.rejects(
    publishMultipartObjects(
      objects,
      {
        stageObject: async () => {},
        publishAlias: async (object) => aliases.push(object.key),
        verifyObjects: async (_selected, publicServing) => {
          if (publicServing) throw new Error("Public bytes mismatch")
        },
      },
      "upload",
    ),
    /mismatch/,
  )
  assert.deepEqual(aliases, [])
})

test("disabled-gateway multipart staging retains authenticated verification without public reads", async () => {
  const { publishMultipartObjects } = await import("../.internal/deploy/multipart.mjs")
  const calls = []
  const objects = [
    { key: "version/installer", mutable: false },
    { key: "latest.txt", mutable: true },
  ]
  await publishMultipartObjects(
    objects,
    {
      stageObject: async (object) => calls.push(object.key),
      publishAlias: async () => {
        throw new Error("Staging must not publish aliases")
      },
      verifyObjects: async (selected, publicServing) => {
        assert.equal(selected, objects)
        assert.equal(publicServing, false)
      },
    },
    "stage",
  )
  assert.deepEqual(calls, ["version/installer", "latest.txt"])
})
