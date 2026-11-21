import { mkdtemp, mkdir, rm, writeFile } from "node:fs/promises"
import http from "node:http"
import os from "node:os"
import path from "node:path"
import { afterEach, describe, expect, it } from "vitest"

import {
  DIFF_WASM_PUBLIC_PREFIX,
  createDiffWasmAssetsPlugin,
  diffWasmAssetFiles,
  resolveDiffWasmAsset,
} from "./vite-diff-wasm-assets"

type Middleware = (req: http.IncomingMessage, res: http.ServerResponse, next: (error?: unknown) => void) => void

const cleanups: Array<() => Promise<void>> = []

afterEach(async () => {
  for (const cleanup of cleanups.splice(0)) await cleanup()
})

async function createPackage(): Promise<string> {
  const root = await mkdtemp(path.join(os.tmpdir(), "diff-wasm-assets-"))
  cleanups.push(() => rm(root, { recursive: true, force: true }))
  for (const file of diffWasmAssetFiles()) {
    await mkdir(path.dirname(path.join(root, file)), { recursive: true })
    await writeFile(path.join(root, file), `contents of ${file}`)
  }
  await writeFile(path.join(root, "package.json"), "{}")
  return root
}

function middlewareOf(root: string): Middleware {
  const plugin = createDiffWasmAssetsPlugin(root)
  let middleware: Middleware | undefined
  const configure = plugin.configureServer as unknown as (server: { middlewares: { use: (fn: Middleware) => void } }) => void
  configure({ middlewares: { use: (fn) => (middleware = fn) } })
  if (!middleware) throw new Error("plugin registered no middleware")
  return middleware
}

async function serve(middleware: Middleware): Promise<string> {
  const server = http.createServer((req, res) => {
    middleware(req, res, (error) => {
      res.statusCode = error ? 500 : 404
      res.end(error ? "error" : "next")
    })
  })
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve))
  cleanups.push(() => new Promise<void>((resolve) => server.close(() => resolve())))
  const address = server.address()
  if (!address || typeof address === "string") throw new Error("Failed to bind test server")
  return `http://127.0.0.1:${address.port}`
}

describe("diff wasm asset plugin", () => {
  it("resolves only the engine's published files", () => {
    expect(resolveDiffWasmAsset(`${DIFF_WASM_PUBLIC_PREFIX}dist/browser.js?t=1`)).toBe("dist/browser.js")
    expect(resolveDiffWasmAsset(`${DIFF_WASM_PUBLIC_PREFIX}wasm/ax_code_diff_wasm_bg.wasm`)).toBe(
      "wasm/ax_code_diff_wasm_bg.wasm",
    )
    expect(resolveDiffWasmAsset(`${DIFF_WASM_PUBLIC_PREFIX}package.json`)).toBeNull()
    expect(resolveDiffWasmAsset(`${DIFF_WASM_PUBLIC_PREFIX}dist/../package.json`)).toBeNull()
    expect(resolveDiffWasmAsset(`${DIFF_WASM_PUBLIC_PREFIX}dist/%2e%2e/package.json`)).toBeNull()
    expect(resolveDiffWasmAsset("/assets/index.js")).toBeNull()
    expect(resolveDiffWasmAsset(undefined)).toBeNull()
  })

  it("serves the binary as application/wasm and scripts as JavaScript", async () => {
    const origin = await serve(middlewareOf(await createPackage()))

    const wasm = await fetch(`${origin}${DIFF_WASM_PUBLIC_PREFIX}wasm/ax_code_diff_wasm_bg.wasm`)
    expect(wasm.status).toBe(200)
    expect(wasm.headers.get("content-type")).toBe("application/wasm")
    expect(await wasm.text()).toBe("contents of wasm/ax_code_diff_wasm_bg.wasm")

    const script = await fetch(`${origin}${DIFF_WASM_PUBLIC_PREFIX}dist/browser-worker.js`)
    expect(script.headers.get("content-type")).toBe("text/javascript; charset=utf-8")
    expect(await script.text()).toBe("contents of dist/browser-worker.js")
  })

  it("passes on other requests, unlisted package files and writes", async () => {
    const origin = await serve(middlewareOf(await createPackage()))

    expect((await fetch(`${origin}/index.html`)).status).toBe(404)
    expect((await fetch(`${origin}${DIFF_WASM_PUBLIC_PREFIX}package.json`)).status).toBe(404)
    expect((await fetch(`${origin}${DIFF_WASM_PUBLIC_PREFIX}dist/browser.js`, { method: "POST" })).status).toBe(404)
  })

  it("reports a missing engine file instead of answering with an empty module", async () => {
    const root = await createPackage()
    await rm(path.join(root, "dist/browser.js"))
    const origin = await serve(middlewareOf(root))

    expect((await fetch(`${origin}${DIFF_WASM_PUBLIC_PREFIX}dist/browser.js`)).status).toBe(500)
  })

  it("emits every engine file at its fixed path in the build", async () => {
    const root = await createPackage()
    const plugin = createDiffWasmAssetsPlugin(root)
    const emitted = new Map<string, string>()
    const generateBundle = plugin.generateBundle as unknown as (this: {
      emitFile: (file: { type: string; fileName: string; source: Buffer }) => void
    }) => void
    generateBundle.call({ emitFile: (file) => emitted.set(file.fileName, file.source.toString()) })

    expect([...emitted.keys()].sort()).toEqual(
      diffWasmAssetFiles()
        .map((file) => `vendor/ax-code-diff-wasm/${file}`)
        .sort(),
    )
    expect(emitted.get("vendor/ax-code-diff-wasm/dist/browser.js")).toBe("contents of dist/browser.js")
  })
})
