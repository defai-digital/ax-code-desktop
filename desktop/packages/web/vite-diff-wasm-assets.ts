import { readFileSync } from "node:fs"
import type { IncomingMessage, ServerResponse } from "node:http"
import path from "node:path"
import type { Plugin } from "vite"

/**
 * Where the renderer finds the AX Code diff engine. Must match `DIFF_ENGINE_MODULE_PATH` in the UI
 * package's `diffParse.worker.ts`, which loads `dist/browser.js` from here.
 */
export const DIFF_WASM_PUBLIC_PREFIX = "/vendor/ax-code-diff-wasm/"

// The engine's module Worker and WebAssembly binary are located relative to its own files at run
// time, so the published files ship unmodified and unbundled; nothing else from the package is served.
const DIFF_WASM_FILES: Readonly<Record<string, string>> = {
  "dist/browser.js": "text/javascript; charset=utf-8",
  "dist/browser-worker.js": "text/javascript; charset=utf-8",
  "wasm/ax_code_diff_wasm.js": "text/javascript; charset=utf-8",
  "wasm/ax_code_diff_wasm_bg.wasm": "application/wasm",
  LICENSE: "text/plain; charset=utf-8",
  NOTICE: "text/plain; charset=utf-8",
}

export const diffWasmAssetFiles = (): string[] => Object.keys(DIFF_WASM_FILES)

/** The package-relative file a request names, or null when the request is not for an engine file. */
export function resolveDiffWasmAsset(url: string | undefined): string | null {
  if (typeof url !== "string") return null
  let pathname: string
  try {
    pathname = new URL(url, "http://127.0.0.1").pathname
  } catch {
    return null
  }
  if (!pathname.startsWith(DIFF_WASM_PUBLIC_PREFIX)) return null
  const file = pathname.slice(DIFF_WASM_PUBLIC_PREFIX.length)
  return Object.hasOwn(DIFF_WASM_FILES, file) ? file : null
}

export function createDiffWasmAssetsPlugin(packageRoot: string): Plugin {
  return {
    name: "ax-code-diff-wasm-assets",
    configureServer(server) {
      server.middlewares.use((req: IncomingMessage, res: ServerResponse, next: (error?: unknown) => void) => {
        const file = resolveDiffWasmAsset(req.url)
        if (!file || (req.method !== "GET" && req.method !== "HEAD")) {
          next()
          return
        }
        let body: Buffer
        try {
          body = readFileSync(path.join(packageRoot, file))
        } catch (error) {
          next(error)
          return
        }
        res.statusCode = 200
        res.setHeader("Content-Type", DIFF_WASM_FILES[file])
        res.setHeader("Content-Length", body.byteLength)
        res.setHeader("Cache-Control", "no-cache")
        res.end(req.method === "HEAD" ? undefined : body)
      })
    },
    generateBundle() {
      for (const file of diffWasmAssetFiles()) {
        this.emitFile({
          type: "asset",
          fileName: `${DIFF_WASM_PUBLIC_PREFIX.slice(1)}${file}`,
          source: readFileSync(path.join(packageRoot, file)),
        })
      }
    },
  }
}
