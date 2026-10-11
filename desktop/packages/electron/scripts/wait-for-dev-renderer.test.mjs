import { afterEach, describe, expect, it } from "vitest"
import { spawn } from "node:child_process"
import { EventEmitter, once } from "node:events"
import net from "node:net"
import path from "node:path"
import { fileURLToPath } from "node:url"
import devPorts from "../../../shared/dev-ports.json" with { type: "json" }
import { waitForDevRenderer } from "./wait-for-dev-renderer.mjs"

const webDir = fileURLToPath(new URL("../../web/", import.meta.url))
const children = []
const blockers = []

afterEach(async () => {
  for (const child of children.splice(0)) {
    if (child.exitCode !== null || child.signalCode !== null) continue
    const exited = once(child, "exit")
    const force = setTimeout(() => child.kill("SIGKILL"), 5000)
    child.kill("SIGTERM")
    await exited
    clearTimeout(force)
  }
  for (const server of blockers.splice(0)) await new Promise((resolve) => server.close(resolve))
})

function startRenderer(override) {
  const env = { ...process.env }
  delete env.AX_CODE_DESKTOP_RENDERER_PORT
  if (override !== undefined) env.AX_CODE_DESKTOP_RENDERER_PORT = String(override)
  const child = spawn(process.execPath, [path.join(webDir, "scripts/dev-vite.mjs")], {
    cwd: webDir,
    env,
    stdio: ["ignore", "ignore", "pipe", "ipc"],
  })
  child.diagnostics = ""
  child.stderr.on("data", (data) => {
    child.diagnostics += data.toString()
  })
  children.push(child)
  return child
}

async function blockPort(port) {
  const server = net.createServer()
  try {
    await new Promise((resolve, reject) => {
      server.once("error", reject)
      server.listen(port, "127.0.0.1", resolve)
    })
  } catch (error) {
    // An existing listener already supplies the occupied-port condition.
    if (port && error.code === "EADDRINUSE") return port
    throw error
  }
  blockers.push(server)
  return server.address().port
}

describe("waitForDevRenderer", () => {
  it("waits for the child's port report instead of trusting an unrelated HTTP server", async () => {
    const child = new EventEmitter()
    const ready = waitForDevRenderer(child)
    child.emit("message", { type: "other", port: 5173 })
    child.emit("message", { type: "renderer-ready", port: 31441 })
    await expect(ready).resolves.toBe("http://127.0.0.1:31441")
    expect(child.listenerCount("message")).toBe(0)
  })

  it("rejects a child that exits successfully before binding", async () => {
    const child = new EventEmitter()
    const ready = waitForDevRenderer(child)
    child.emit("exit", 0, null)
    await expect(ready).rejects.toThrow("Vite exited before renderer readiness with 0")
  })

  it("rejects invalid port reports", async () => {
    const child = new EventEmitter()
    const ready = waitForDevRenderer(child)
    child.emit("message", { type: "renderer-ready", port: 65536 })
    await expect(ready).rejects.toThrow("invalid renderer port")
  })

  it("times out when the child never reports readiness", async () => {
    const child = new EventEmitter()
    await expect(waitForDevRenderer(child, 10)).rejects.toThrow("Timed out")
    expect(child.listenerCount("message")).toBe(0)
  })
})

describe("Vite development port binding", () => {
  it("starts a real renderer in the default AX Desktop range", async () => {
    const url = await waitForDevRenderer(startRenderer())
    const port = Number(new URL(url).port)
    expect(port).toBeGreaterThanOrEqual(devPorts.rendererStart)
    expect(port).toBeLessThanOrEqual(devPorts.rendererEnd)
    const response = await fetch(`${url}/@vite/client`)
    expect(response.status).toBe(200)
    expect(await response.text()).toContain("vite")
  }, 30000)

  it("skips an occupied default port and reports the actual bound port", async () => {
    await blockPort(devPorts.rendererStart)
    const url = await waitForDevRenderer(startRenderer())
    const port = Number(new URL(url).port)
    expect(port).toBeGreaterThan(devPorts.rendererStart)
    expect(port).toBeLessThanOrEqual(devPorts.rendererEnd)
    expect((await fetch(`${url}/@vite/client`)).status).toBe(200)
  }, 30000)

  it("fails instead of silently changing an occupied explicit port", async () => {
    const port = await blockPort(0)
    const child = startRenderer(port)
    await expect(waitForDevRenderer(child)).rejects.toThrow("Vite exited before renderer readiness with 1")
    expect(child.diagnostics).toContain(`Port ${port} is already in use`)
  }, 30000)

  it("uses the exact explicit port when it is available", async () => {
    const port = await blockPort(0)
    await new Promise((resolve) => blockers.pop().close(resolve))
    const url = await waitForDevRenderer(startRenderer(port))
    expect(url).toBe(`http://127.0.0.1:${port}`)
    expect((await fetch(`${url}/@vite/client`)).status).toBe(200)
  }, 30000)

  it("stops the renderer when its launcher disconnects", async () => {
    const child = startRenderer()
    await waitForDevRenderer(child)
    const exited = once(child, "exit")
    child.disconnect()
    await expect(exited).resolves.toEqual([0, null])
  }, 30000)

  it("rejects malformed explicit port values", async () => {
    const child = startRenderer("20000oops")
    await expect(waitForDevRenderer(child)).rejects.toThrow("Vite exited before renderer readiness with 1")
    expect(child.diagnostics).toContain("AX_CODE_DESKTOP_RENDERER_PORT must be an integer between 1 and 65535")
  }, 30000)

  it("fails when the entire default range is occupied", async () => {
    for (let port = devPorts.rendererStart; port <= devPorts.rendererEnd; port++) await blockPort(port)
    const child = startRenderer()
    await expect(waitForDevRenderer(child)).rejects.toThrow("Vite exited before renderer readiness with 1")
    expect(child.diagnostics).toContain(
      `No renderer port is available in ${devPorts.rendererStart}-${devPorts.rendererEnd}`,
    )
  }, 30000)
})
