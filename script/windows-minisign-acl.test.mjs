import fs from "node:fs"
import os from "node:os"
import path from "node:path"
import { spawnSync } from "node:child_process"
import { expect, test } from "vitest"

const script = path.resolve(import.meta.dirname, "../desktop/scripts/private-key-acl.ps1")
const windows = process.platform === "win32"
function run(file, mode) {
  return spawnSync("powershell.exe", ["-NoProfile", "-NonInteractive", "-File", script, "-Mode", mode], {
    encoding: "utf8",
    env: { ...process.env, AX_DESKTOP_PRIVATE_PATH: file },
  })
}
test.skipIf(!windows)(
  "enforces owner-only NTFS ACLs and rejects broad grants and inheritance",
  () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), "desktop-private-acl-"))
    const file = path.join(root, "synthetic.key")
    try {
      const protectedDirectory = run(root, "Protect")
      expect(protectedDirectory.status, protectedDirectory.stderr).toBe(0)
      fs.writeFileSync(file, "synthetic-test-key")
      expect(run(file, "Verify").status).not.toBe(0)
      const protectedFile = run(file, "Protect")
      expect(protectedFile.status, protectedFile.stderr).toBe(0)
      expect(run(file, "Verify").status).toBe(0)
      const broaden = spawnSync(
        "powershell.exe",
        [
          "-NoProfile",
          "-NonInteractive",
          "-Command",
          '$acl=Get-Acl -LiteralPath $env:AX_DESKTOP_PRIVATE_PATH; $sid=[Security.Principal.SecurityIdentifier]::new("S-1-1-0"); $rule=[Security.AccessControl.FileSystemAccessRule]::new($sid,[Security.AccessControl.FileSystemRights]::Read,[Security.AccessControl.AccessControlType]::Allow); $acl.AddAccessRule($rule); Set-Acl -LiteralPath $env:AX_DESKTOP_PRIVATE_PATH -AclObject $acl',
        ],
        { encoding: "utf8", env: { ...process.env, AX_DESKTOP_PRIVATE_PATH: file } },
      )
      expect(broaden.status, broaden.stderr).toBe(0)
      expect(run(file, "Verify").status).not.toBe(0)
      expect(run(file, "Protect").status).toBe(0)
    } finally {
      fs.rmSync(root, { recursive: true, force: true })
    }
  },
  30000,
)
test.skipIf(!windows)(
  "refuses reparse-point signing paths",
  () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), "desktop-private-junction-"))
    try {
      const target = path.join(root, "target")
      const link = path.join(root, "link")
      fs.mkdirSync(target)
      fs.symlinkSync(target, link, "junction")
      expect(run(link, "Protect").status).not.toBe(0)
    } finally {
      fs.rmSync(root, { recursive: true, force: true })
    }
  },
  30000,
)
