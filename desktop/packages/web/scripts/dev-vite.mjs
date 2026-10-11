#!/usr/bin/env node
import { createServer } from "vite"
import devPorts from "../../../shared/dev-ports.json" with { type: "json" }

const override = process.env.AX_CODE_DESKTOP_RENDERER_PORT?.trim()
const firstPort = override ? Number(override) : devPorts.rendererStart
const lastPort = override ? firstPort : devPorts.rendererEnd
if (!Number.isInteger(firstPort) || firstPort < 1 || firstPort > 65535) {
  throw new Error("AX_CODE_DESKTOP_RENDERER_PORT must be an integer between 1 and 65535")
}

let server
let stopping = false
async function shutdown() {
  stopping = true
  await server?.close()
}
process.once("SIGINT", () => shutdown().finally(() => process.exit(130)))
process.once("SIGTERM", () => shutdown().finally(() => process.exit(143)))
process.once("disconnect", () => shutdown().finally(() => process.exit(0)))

try {
  for (let port = firstPort; port <= lastPort && !stopping; port++) {
    server = await createServer({ server: { host: "127.0.0.1", port, strictPort: true } })
    try {
      await server.listen()
    } catch (error) {
      await server.close()
      if (error.message !== `Port ${port} is already in use` || override) throw error
      console.log(`[electron-dev] Renderer port ${port} is occupied; trying the next port`)
      continue
    }
    if (stopping) {
      await server.close()
      break
    }
    const address = server.httpServer.address()
    server.printUrls()
    process.send?.({ type: "renderer-ready", port: address.port })
    break
  }
  if (!stopping && !server?.httpServer?.listening) {
    throw new Error(`No renderer port is available in ${firstPort}-${lastPort}`)
  }
} catch (error) {
  console.error(`[electron-dev] ${error.message}`)
  await shutdown()
  process.exit(1)
}
