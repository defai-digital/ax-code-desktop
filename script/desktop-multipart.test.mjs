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
