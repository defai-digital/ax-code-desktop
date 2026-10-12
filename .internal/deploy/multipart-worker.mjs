export async function handle(request, env, manifest) {
  if (!env.UPLOAD_TOKEN || request.headers.get("Authorization") !== "Bearer " + env.UPLOAD_TOKEN)
    return new Response("Unauthorized", { status: 401 })
  const url = new URL(request.url),
    key = url.searchParams.get("key"),
    entry = manifest[key]
  if (!entry || request.method !== "POST") return new Response("Forbidden", { status: 403 })
  try {
    if (url.pathname === "/create") {
      if (await env.BUCKET.head(key)) return new Response("Immutable object already exists", { status: 409 })
      const upload = await env.BUCKET.createMultipartUpload(key)
      return Response.json({ uploadId: upload.uploadId })
    }
    const id = url.searchParams.get("id")
    if (!id || id.length > 500) return new Response("Invalid upload ID", { status: 400 })
    const upload = env.BUCKET.resumeMultipartUpload(key, id)
    if (url.pathname === "/abort") {
      await upload.abort()
      return Response.json({ aborted: true })
    }
    if (url.pathname === "/part") {
      const number = Number(url.searchParams.get("part")),
        expected = entry.parts[number - 1]
      if (!Number.isSafeInteger(number) || number < 1 || !expected) return new Response("Invalid part", { status: 400 })
      if (Number(request.headers.get("Content-Length")) !== expected.size)
        return new Response("Invalid size", { status: 400 })
      const bytes = await request.arrayBuffer()
      if (bytes.byteLength !== expected.size) return new Response("Invalid size", { status: 400 })
      const hash = Array.from(new Uint8Array(await crypto.subtle.digest("SHA-256", bytes)), (x) =>
        x.toString(16).padStart(2, "0"),
      ).join("")
      if (hash !== expected.sha256) return new Response("Invalid hash", { status: 400 })
      return Response.json(await upload.uploadPart(number, bytes))
    }
    if (url.pathname === "/complete") {
      const parts = await request.json()
      if (
        !Array.isArray(parts) ||
        parts.length !== entry.parts.length ||
        parts.some((x, i) => x.partNumber !== i + 1 || typeof x.etag !== "string" || !x.etag)
      )
        return new Response("Invalid completion", { status: 400 })
      if (await env.BUCKET.head(key)) return new Response("Immutable object already exists", { status: 409 })
      const result = await upload.complete(parts)
      return Response.json({ size: result.size })
    }
    return new Response("Not found", { status: 404 })
  } catch {
    return new Response("Multipart operation failed", { status: 502 })
  }
}
