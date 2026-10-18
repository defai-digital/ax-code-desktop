import { getMermaidCapability, type MermaidWorkerRequest, type MermaidWorkerResponse } from "./mermaidProtocol"

const scope = self as unknown as {
  onmessage: (event: MessageEvent<MermaidWorkerRequest>) => void
  postMessage: (response: MermaidWorkerResponse) => void
}

let renderer: Promise<typeof import("beautiful-mermaid")> | undefined

scope.onmessage = async ({ data: { id, request } }) => {
  const documentDescriptor = Object.getOwnPropertyDescriptor(globalThis, "document")
  const selfDescriptor = Object.getOwnPropertyDescriptor(globalThis, "self")
  const originalSetTimeout = globalThis.setTimeout
  let loading = true
  try {
    if (getMermaidCapability(request.source, request.mode).renderer !== "beautiful-mermaid") {
      throw new Error("Unsupported worker diagram")
    }
    // ELK's bundled CommonJS loader mistakes a real WorkerGlobalScope for its own
    // worker entrypoint and replaces onmessage instead of exporting FakeWorker.
    // beautiful-mermaid uses FakeWorker synchronously and needs no DOM. Keep this
    // environment marker scoped to loading/layout in our dedicated worker.
    Object.defineProperty(globalThis, "document", { value: {}, configurable: true })
    // Its Bun workaround also assigns self unconditionally. WorkerGlobalScope's
    // inherited self getter is read-only, so expose a temporary writable value.
    Object.defineProperty(globalThis, "self", { value: scope, writable: true, configurable: true })
    const { renderMermaidASCII, renderMermaidSVG } = await (renderer ??= import("beautiful-mermaid"))
    loading = false
    const output =
      request.mode === "ascii" ? renderMermaidASCII(request.source) : renderMermaidSVG(request.source, request.colors)
    scope.postMessage({ id, output })
  } catch (error) {
    scope.postMessage({
      id,
      error: error instanceof Error ? error.message : "Unable to render diagram",
      errorCode: loading ? "unavailable" : "render",
    })
  } finally {
    // Upstream's synchronous ELK initialization temporarily replaces setTimeout.
    // Restore it even when layout initialization throws.
    globalThis.setTimeout = originalSetTimeout
    if (documentDescriptor) Object.defineProperty(globalThis, "document", documentDescriptor)
    else Reflect.deleteProperty(globalThis, "document")
    if (selfDescriptor) Object.defineProperty(globalThis, "self", selfDescriptor)
    else Reflect.deleteProperty(globalThis, "self")
  }
}
