import { createDiffParser } from "./diffEngineParse"
import type { DiffParseRequest, DiffParseResponse } from "./diffParseProtocol"

const scope = self as unknown as {
  location?: { href: string }
  onmessage: ((event: MessageEvent<DiffParseRequest>) => void) | null
  postMessage: (response: DiffParseResponse) => void
}

/**
 * The engine's published files, served unmodified beside the app (the diff-wasm asset plugin in the
 * web package's Vite config). The engine starts its own Worker for the WebAssembly kernel and finds
 * that Worker and the binary relative to this module, so it is loaded by URL, not bundled.
 */
export const DIFF_ENGINE_MODULE_PATH = "/vendor/ax-code-diff-wasm/dist/browser.js"

async function loadEngine() {
  if (!scope.location) throw new Error("diff engine needs a Worker location")
  const url = new URL(DIFF_ENGINE_MODULE_PATH, scope.location.href).href
  const module = (await import(/* @vite-ignore */ url)) as typeof import("@ax-code/diff-wasm")
  return module.createDiffEngine()
}

const parse = createDiffParser(loadEngine)

// Computes the diff off the renderer thread (SPEC-2026-11-08-diff-parse-worker-v1,
// SPEC-2026-11-21-diff-wasm-engine-v1). The result is plain FileDiffMetadata data, so it survives
// the structured clone back to the window.
scope.onmessage = ({ data }) => {
  parse(data).then(
    ({ diff, approximate }) => scope.postMessage(approximate ? { id: data.id, diff, approximate } : { id: data.id, diff }),
    (error: unknown) =>
      scope.postMessage({ id: data.id, error: error instanceof Error ? error.message : "diff parse failed" }),
  )
}
