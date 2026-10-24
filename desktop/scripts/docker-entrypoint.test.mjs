import { describe, expect, test } from "vitest"
import { spawnSync } from "node:child_process"
import fs from "node:fs"
import os from "node:os"
import path from "node:path"

const repoRoot = path.resolve(import.meta.dirname, "..")
const script = path.join(repoRoot, "scripts/docker-entrypoint.sh")

function makeTempDir() {
  return fs.mkdtempSync(path.join(os.tmpdir(), "ax-code-desktop-entrypoint-test-"))
}

function shellQuote(value) {
  return `'${value.replaceAll("'", "'\\''")}'`
}

/**
 * The entrypoint builds its command and execs it, and it touches /home/openchamber
 * (hard-coded, root-only). Shim everything it shells out to — plus `node` — so the
 * script can run from a test and report the argv it exec'd.
 */
function createFixture() {
  const dir = makeTempDir()
  const bin = path.join(dir, "bin")
  fs.mkdirSync(bin)

  const argsLog = path.join(dir, "node-args.log")
  const envLog = path.join(dir, "node-env.log")
  const mkdir = path.join(bin, "mkdir")
  const chmod = path.join(bin, "chmod")
  const sshKeygen = path.join(bin, "ssh-keygen")
  const node = path.join(bin, "node")

  fs.writeFileSync(mkdir, `#!/bin/sh\nexit 0\n`)
  fs.writeFileSync(chmod, `#!/bin/sh\nexit 0\n`)
  fs.writeFileSync(sshKeygen, `#!/bin/sh\nexit 0\n`)
  fs.writeFileSync(
    node,
    `#!/bin/sh\nprintf '%s\\n' "$@" > ${shellQuote(argsLog)}\nprintf '%s' "\${AX_CODE_DESKTOP_UI_PASSWORD:-}" > ${shellQuote(envLog)}\nexit 0\n`,
  )
  for (const file of [mkdir, chmod, sshKeygen, node]) {
    fs.chmodSync(file, 0o755)
  }

  return {
    dir,
    bin,
    argsLog,
    projectRoot: dir,
    readArgs: () => (fs.existsSync(argsLog) ? fs.readFileSync(argsLog, "utf8").trim().split("\n") : []),
    readEnv: () => (fs.existsSync(envLog) ? fs.readFileSync(envLog, "utf8") : ""),
    cleanup: () => fs.rmSync(dir, { recursive: true, force: true }),
  }
}

function runEntrypoint(fixture, env = {}) {
  return spawnSync("sh", [script], {
    cwd: fixture.projectRoot,
    encoding: "utf8",
    env: {
      PATH: `${fixture.bin}:${process.env.PATH}`,
      HOME: process.env.HOME,
      // The shims stand in for the root-only paths the real image has.
      ...env,
    },
  })
}

describe("docker entrypoint", () => {
  test("serves in the foreground so the server is the container's PID 1", () => {
    // `serve` alone daemonises: the CLI spawned the server detached and exited, and this
    // script's last line made the log follower PID 1. A server that then died left the
    // container running, and the platform's restart policy never fired.
    const fixture = createFixture()
    try {
      fs.mkdirSync(path.join(fixture.projectRoot, "desktop/packages/web/bin"), { recursive: true })
      fs.writeFileSync(path.join(fixture.projectRoot, "desktop/packages/web/bin/cli.js"), "// cli\n")

      const result = runEntrypoint(fixture)

      expect(result.status).toBe(0)
      expect(fixture.readArgs()).toEqual(["desktop/packages/web/bin/cli.js", "serve", "--foreground"])
    } finally {
      fixture.cleanup()
    }
  })

  test("forwards the UI password to the server it starts, out of its argv", () => {
    const fixture = createFixture()
    try {
      fs.mkdirSync(path.join(fixture.projectRoot, "packages/web/bin"), { recursive: true })
      fs.writeFileSync(path.join(fixture.projectRoot, "packages/web/bin/cli.js"), "// cli\n")

      const result = runEntrypoint(fixture, { UI_PASSWORD: "hunter2" })

      expect(result.status).toBe(0)
      // In the environment: `--ui-password <secret>` put the password in the process argv, where every process in
      // the container can read it with `ps`, and the CLI reads the variable.
      expect(fixture.readArgs()).toEqual(["packages/web/bin/cli.js", "serve", "--foreground"])
      expect(fixture.readEnv()).toBe("hunter2")
    } finally {
      fixture.cleanup()
    }
  })

  test("still execs an explicit command instead of starting the server", () => {
    const fixture = createFixture()
    try {
      const result = spawnSync("sh", [script, fixture.bin + "/node", "custom-command"], {
        cwd: fixture.projectRoot,
        encoding: "utf8",
        env: { PATH: `${fixture.bin}:${process.env.PATH}`, HOME: process.env.HOME },
      })

      expect(result.status).toBe(0)
      expect(fixture.readArgs()).toEqual(["custom-command"])
    } finally {
      fixture.cleanup()
    }
  })
})
