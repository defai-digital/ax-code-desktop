import fs from "node:fs"
import path from "node:path"
import crypto from "node:crypto"
import assert from "node:assert/strict"
import { handle } from "./multipart-worker.mjs"
import { fileURLToPath } from "node:url"
import {
  qualifiedDirectory,
  releaseObjects,
  storageBytes,
  putStaged,
  verifyReleaseObjects,
  BASE,
} from "./distribution.mjs"
export async function stageMultipart(source, qualificationFile, receiptFile) {
  const account = "89657c08227b638ab67905e1c5899406",
    token = process.env.CLOUDFLARE_API_TOKEN
  const inventory = qualifiedDirectory(source, qualificationFile)
  assert.ok(token, "Cloudflare API token is required")
  const objects = releaseObjects(source, inventory),
    limit = 300 * 1024 * 1024,
    partSize = 32 * 1024 * 1024
  const hash = (b) => crypto.createHash("sha256").update(b).digest("hex"),
    manifest = {}
  for (const object of objects) {
    if (object.content.length <= limit) continue
    assert.equal(object.mutable, false)
    const parts = []
    for (let start = 0; start < object.content.length; start += partSize) {
      const part = object.content.subarray(start, start + partSize)
      parts.push({ size: part.length, sha256: hash(part) })
    }
    manifest[object.key] = { size: object.content.length, sha256: hash(object.content), parts }
  }
  assert.ok(Object.keys(manifest).length > 0)
  const installer = await fetch(BASE + "/install")
  assert.equal(installer.status, 503)
  assert.ok((await installer.text()).includes("Desktop public release is not enabled"))
  const name = "ax-desktop-stage-" + crypto.randomBytes(6).toString("hex"),
    capability = crypto.randomBytes(32).toString("hex")
  const apiBase = "https://api.cloudflare.com/client/v4/accounts/" + account
  const api = async (endpoint, method = "GET", body) => {
    const response = await fetch(apiBase + endpoint, {
      method,
      body,
      headers: {
        Authorization: "Bearer " + token,
        ...(typeof body === "string" ? { "Content-Type": "application/json" } : {}),
      },
      signal: AbortSignal.timeout(180000),
    })
    if (!response.ok) throw Error("Cloudflare management operation failed: " + method + " HTTP " + response.status)
    const result = await response.json()
    assert.equal(result.success, true)
    return result.result
  }
  const subdomain = (await api("/workers/subdomain")).subdomain
  assert.match(subdomain, /^[a-z0-9-]+$/)
  const url = "https://" + name + "." + subdomain + ".workers.dev"
  const source =
    "const manifest=" +
    JSON.stringify(manifest) +
    ";\n" +
    handle.toString() +
    "\nexport default {fetch:(request,env)=>handle(request,env,manifest)};"
  const form = new FormData()
  form.set(
    "metadata",
    new Blob(
      [
        JSON.stringify({
          main_module: "worker.mjs",
          compatibility_date: "2026-10-12",
          bindings: [
            { type: "r2_bucket", name: "BUCKET", bucket_name: "ax-code-desktop-releases" },
            { type: "secret_text", name: "UPLOAD_TOKEN", text: capability },
          ],
        }),
      ],
      { type: "application/json" },
    ),
  )
  form.set("worker.mjs", new Blob([source], { type: "application/javascript+module" }), "worker.mjs")
  let created = false
  const call = async (action, key, id, part, body) => {
    const target = new URL(url + "/" + action)
    target.searchParams.set("key", key)
    if (id) target.searchParams.set("id", id)
    if (part) target.searchParams.set("part", String(part))
    const response = await fetch(target, {
      method: "POST",
      body,
      headers: { Authorization: "Bearer " + capability },
      signal: AbortSignal.timeout(600000),
    })
    assert.ok(response.ok, "Multipart " + action + " failed: HTTP " + response.status)
    return response.json()
  }
  try {
    await api("/workers/scripts/" + name, "PUT", form)
    created = true
    await api(
      "/workers/scripts/" + name + "/subdomain",
      "POST",
      JSON.stringify({ enabled: true, previews_enabled: false }),
    )
    // Wait briefly for isolated workers.dev propagation; no secrets in logs.
    let reachable = false
    for (let i = 0; i < 30; i++) {
      try {
        const r = await fetch(url, { signal: AbortSignal.timeout(5000) })
        if (r.status === 401) {
          reachable = true
          break
        }
      } catch {}
      await new Promise((r) => setTimeout(r, 2000))
    }
    assert.ok(reachable, "Authenticated upload worker did not become reachable")
    for (const object of objects) {
      console.log("Staging " + object.key)
      if (object.content.length <= limit) {
        await putStaged(object.key, object.content, { account, token, mutable: object.mutable })
        continue
      }
      const old = await storageBytes(object.key, { account, token })
      if (old) {
        assert.ok(old.equals(object.content), "Immutable collision")
        continue
      }
      const { uploadId } = await call("create", object.key)
      let complete = false
      try {
        const parts = []
        for (let start = 0, number = 1; start < object.content.length; start += partSize, number++) {
          parts.push(await call("part", object.key, uploadId, number, object.content.subarray(start, start + partSize)))
          console.log("Verified multipart part " + number + "/" + manifest[object.key].parts.length)
        }
        const result = await call("complete", object.key, uploadId, 0, JSON.stringify(parts))
        assert.equal(result.size, object.content.length)
        complete = true
        const actual = await storageBytes(object.key, { account, token })
        assert.ok(actual?.equals(object.content), "Multipart readback mismatch")
      } finally {
        if (!complete) await call("abort", object.key, uploadId)
      }
    }
    await verifyReleaseObjects(objects, { account, token })
    if (receiptFile)
      fs.writeFileSync(
        receiptFile,
        JSON.stringify(
          {
            schema: "ax-code-desktop.r2-multipart-stage.v1",
            commit: inventory.commit,
            version: inventory.version,
            inventorySha256: inventory.digest,
            verifiedObjects: objects.map((x) => ({ key: x.key, size: x.content.length, sha256: hash(x.content) })),
            multipartManifest: manifest,
          },
          null,
          2,
        ) + "\n",
      )
    console.log("All staged objects passed authenticated byte-for-byte readback.")
  } finally {
    if (created) {
      await api("/workers/scripts/" + name, "DELETE")
      console.log("Removed temporary authenticated upload worker.")
    }
  }

  return inventory
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    const args = {}
    for (let i = 2; i < process.argv.length; i += 2) {
      const flag = process.argv[i],
        value = process.argv[i + 1]
      assert.ok(
        ["--source", "--qualification", "--receipt"].includes(flag) && value && !Object.hasOwn(args, flag),
        "Invalid multipart staging arguments",
      )
      args[flag] = value
    }
    assert.ok(args["--source"] && args["--qualification"], "--source and --qualification are required")
    await stageMultipart(
      path.resolve(args["--source"]),
      path.resolve(args["--qualification"]),
      args["--receipt"] && path.resolve(args["--receipt"]),
    )
  } catch (error) {
    console.error(error instanceof Error ? error.message : "Multipart staging failed")
    process.exitCode = 1
  }
}
