// Fixture-only background bridge. Production IPC and preload remain unchanged.
import { parentPort } from "node:worker_threads"
import { spawn } from "node:child_process"
import { once } from "node:events"
import { createInterface } from "node:readline"
import {
  buildFullMarkdownBlock,
  buildLiveMarkdownBlocks,
} from "../../../../desktop/packages/ui/src/components/chat/markdownStreamBlocks"
import { adaptNativeMarkdown } from "../../../../desktop/packages/ui/src/components/chat/markdownNativeAdapter.bench"
import type { Root } from "mdast"

const child = spawn(process.env.AX_NATIVE_BENCH_BINARY!, [], { stdio: ["pipe", "pipe", "inherit"] })
const ready = once(child, "spawn")
ready.then(() => parentPort!.postMessage({ nativePid: child.pid })).catch(() => {})
const lines = createInterface({ input: child.stdout })[Symbol.asyncIterator]()
let tail = Promise.resolve()
parentPort!.on("message", (request) => {
  tail = tail.then(async () => {
    try {
      await ready
      const projected = request.live
        ? buildLiveMarkdownBlocks(request.text, request.baseKey).blocks
        : [buildFullMarkdownBlock(request.text, request.baseKey)]
      child.stdin.write(`${JSON.stringify({ sources: projected.map((block) => block.src) })}\n`)
      const line = await lines.next()
      if (line.done) throw new Error("Parser process exited")
      const { trees } = JSON.parse(line.value) as { trees: Root[] }
      const blocks = projected.map((block, index) => ({ ...block, tree: adaptNativeMarkdown(trees[index], block.src) }))
      parentPort!.postMessage({ id: request.id, blocks })
    } catch (error) {
      parentPort!.postMessage({ id: request.id, blocks: null, error: String(error) })
    }
  })
})
