import childProcess from "node:child_process"
import { createRequire } from "node:module"
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from "node:fs"
import { tmpdir } from "node:os"
import path from "node:path"
import { afterEach, describe, expect, test, vi } from "vitest"

const require = createRequire(import.meta.url)
const { classifyFile, collectPeFiles } = require("./windows-binary-format.cjs")

function fixture(run) {
  const root = mkdtempSync(path.join(tmpdir(), "desktop-windows-binaries-"))
  const put = (relative, bytes) => {
    const file = path.join(root, relative)
    mkdirSync(path.dirname(file), { recursive: true })
    writeFileSync(file, bytes)
    return file
  }
  try {
    run(root, put)
  } finally {
    rmSync(root, { recursive: true, force: true })
  }
}

function pe() {
  const bytes = Buffer.alloc(132)
  bytes.write("MZ")
  bytes.writeUInt32LE(128, 0x3c)
  bytes.set([0x50, 0x45, 0, 0], 128)
  return bytes
}

const foreignPath = "resources/ax-code/node_modules/node-pty-prebuilt-multiarch/prebuilds"

describe("Windows signing target classification", () => {
  test("audits every PE, including native addons, while preserving foreign pinned prebuilds", () =>
    fixture((root, put) => {
      const executable = put("AX Code.exe", pe())
      const addon = put(`${foreignPath}/win32-x64/node.node`, pe())
      const linux = put(`${foreignPath}/linux-x64/node.abi108.musl.node`, Buffer.from("7f454c4602010100", "hex"))
      const mac = put(`${foreignPath}/darwin-arm64/node.node`, Buffer.from("cffaedfe01000000", "hex"))
      expect(classifyFile(linux)).toBe("foreign")
      expect(classifyFile(mac)).toBe("foreign")
      expect(collectPeFiles(root).sort()).toEqual([executable, addon].sort())
    }))

  test.each([
    ["AX Code.exe", "7f454c46"],
    ["resources/other/node.node", "7f454c46"],
    [`${foreignPath}/win32-x64/node.node`, "7f454c46"],
    [`${foreignPath}/linux-x64/node.node`, "cffaedfe"],
    [`${foreignPath}/darwin-arm64/node.node`, "7f454c46"],
    [`${foreignPath}/linux-x64/node.node`, "00000000"],
  ])("fails closed for unexpected binary %s with magic %s", (relative, magic) =>
    fixture((root, put) => {
      put(relative, Buffer.from(magic, "hex"))
      expect(() => collectPeFiles(root)).toThrow(/Unrecognized Windows signing target/)
    }),
  )

  test("rejects a DOS header without a valid PE signature", () =>
    fixture((root, put) => {
      const bytes = pe()
      bytes.writeUInt32LE(0xffffffff, 0x3c)
      expect(() => classifyFile(put("broken.dll", bytes))).toThrow(/Unrecognized/)
      bytes.writeUInt32LE(128, 0x3c)
      bytes.fill(0, 128)
      expect(() => classifyFile(put("broken.node", bytes))).toThrow(/Unrecognized/)
    }))
})

describe("Windows sign hook format enforcement", () => {
  afterEach(() => {
    vi.restoreAllMocks()
    vi.unstubAllEnvs()
  })

  test("never sends foreign prebuilds to Azure and still signs and verifies PE files", async () => {
    const calls = vi.spyOn(childProcess, "execFileSync").mockReturnValue(Buffer.alloc(0))
    for (const [name, value] of Object.entries({
      AZURE_TENANT_ID: "tenant",
      AZURE_CLIENT_ID: "client",
      AZURE_CLIENT_SECRET: "fixture-only",
      AZURE_KEY_VAULT_URL: "https://keyvault-defai.vault.azure.net",
      AZURE_KEY_VAULT_CERTIFICATE: "cert-defai",
      AZURE_SIGNTOOL_PATH: "AzureSignTool.exe",
      WINDOWS_CERTIFICATE_SHA1: "FC40F1109912C025E751E804AA9BD1538A2D12EF",
      WINDOWS_SIGNING_REQUIRED: "true",
    }))
      vi.stubEnv(name, value)
    delete require.cache[require.resolve("./sign-windows.cjs")]
    const sign = require("./sign-windows.cjs").default
    const root = mkdtempSync(path.join(tmpdir(), "desktop-windows-sign-hook-"))
    try {
      const foreign = path.join(root, foreignPath, "linux-x64", "node.node")
      mkdirSync(path.dirname(foreign), { recursive: true })
      writeFileSync(foreign, Buffer.from("7f454c4602010100", "hex"))
      await sign({ path: foreign, hash: "sha256" })
      expect(calls).not.toHaveBeenCalled()
      const executable = path.join(root, "AX Code.exe")
      writeFileSync(executable, pe())
      await sign({ path: executable, hash: "sha256" })
      expect(calls.mock.calls.map(([command]) => command)).toEqual(["AzureSignTool.exe", "powershell.exe"])
      expect(calls.mock.calls[1][2].env.AX_SIGNED_FILE).toBe(executable)
      writeFileSync(executable, Buffer.from("7f454c46", "hex"))
      await expect(sign({ path: executable, hash: "sha256" })).rejects.toThrow(/Unrecognized/)
      expect(calls).toHaveBeenCalledTimes(2)
    } finally {
      rmSync(root, { recursive: true, force: true })
      delete require.cache[require.resolve("./sign-windows.cjs")]
    }
  })
})
