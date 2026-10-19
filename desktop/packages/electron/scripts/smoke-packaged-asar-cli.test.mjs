import { describe, expect, test } from "vitest"
import { spawnSync } from "node:child_process"
import fs from "node:fs"
import net from "node:net"
import os from "node:os"
import path from "node:path"
import { extractAssetPath, packagedPaths, parseSmokeArgs, request } from "./smoke-packaged-asar-cli.mjs"

describe("packaged ASAR CLI smoke", () => {
  test("parses builder flags and a bounded timeout", () => {
    expect(parseSmokeArgs(["--win", "--arm64", "--timeout-ms", "90000"])).toEqual({
      builderArgs: ["--win", "--arm64"],
      timeoutMs: 90_000,
    })
    expect(() => parseSmokeArgs(["--linux", "--timeout-ms", "0"])).toThrow("between 1000 and 300000")
  })

  test("resolves ASAR and runtime paths for every packaged layout", () => {
    const windows = packagedPaths({ appPath: "/release/AX Code.exe", platform: "win32" })
    expect(windows.cliPath).toBe(path.join("/release", "resources", "app.asar", "dist", "desktop-cli.mjs"))
    expect(windows.launcherPath.endsWith(path.join("ax-code", "bin", "ax-code.cmd"))).toBe(true)

    const linux = packagedPaths({ appPath: "/release/ax-code-desktop", platform: "linux" })
    expect(linux.webDistPath).toBe("/release/resources/app.asar/web-dist")

    const mac = packagedPaths({ appPath: "/release/AX Code.app", platform: "darwin" })
    expect(mac.executablePath).toBe("/release/AX Code.app/Contents/MacOS/AX Code")
  })

  test("extracts a packaged renderer asset from HTML", () => {
    expect(extractAssetPath('<link href="/assets/app.css"><script src="/assets/app.js"></script>')).toBe(
      "/assets/app.css",
    )
    expect(extractAssetPath("<html></html>")).toBeUndefined()
  })
})

describe("CLI entry guard", () => {
  test("runs as a command when its path carries a symlink", () => {
    const script = path.resolve(import.meta.dirname, "smoke-packaged-asar-cli.mjs")
    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "ax-code-asar-cli-link-"))
    const link = path.join(tempDir, "smoke-packaged-asar-cli-link.mjs")
    fs.symlinkSync(script, link)

    try {
      // Invalid arguments make a running entry point fail instead of exiting 0 silently.
      const result = spawnSync("node", [link], { encoding: "utf8" })
      expect(result.status).toBe(1)
      expect(result.stderr).toContain("Packaging must select exactly one of --mac, --win, or --linux")
    } finally {
      fs.rmSync(tempDir, { recursive: true, force: true })
    }
  })
})

describe("packaged ASAR CLI smoke requests", () => {
  test("gives up on a server that accepts and then never answers", async () => {
    // `--timeout-ms` is only checked between readiness attempts, so a socket that was accepted and
    // then went quiet held the gate — and the packaged CLI process — past its deadline.
    const sockets = new Set()
    const server = net.createServer((socket) => {
      sockets.add(socket)
      socket.on("close", () => sockets.delete(socket))
    })
    await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve))
    const port = server.address().port
    try {
      await expect(request(port, "/", { timeoutMs: 50 })).rejects.toThrow("did not answer within 50ms")
    } finally {
      // The accepted socket stays open on this side, and `close` waits for it.
      for (const socket of sockets) socket.destroy()
      await new Promise((resolve) => server.close(resolve))
    }
  })
})
