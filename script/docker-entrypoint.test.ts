import { spawnSync } from "node:child_process"
import fs from "node:fs"
import os from "node:os"
import path from "node:path"
import { describe, expect, test } from "vitest"

const entrypoint = path.resolve(process.cwd(), "desktop/scripts/docker-entrypoint.sh")

describe("container entrypoint", () => {
  test("hands the UI password to the server in the environment, not in its argv", () => {
    // `--ui-password <secret>` put the container's UI password in the process argv, where every process in the
    // container can read it with `ps`. The CLI reads the variable instead, and the terminal a user opens from the
    // app drops both names before the shell sees them.
    const workDir = fs.mkdtempSync(path.join(os.tmpdir(), "ax-entrypoint-"))
    try {
      // The script's own HOME is the image's (/home/openchamber), so the probe runs a copy with a HOME this test
      // can write: everything the test looks at is below that line.
      const source = fs.readFileSync(entrypoint, "utf8").replace('HOME="/home/openchamber"', `HOME="${workDir}"`)
      const probePath = path.join(workDir, "entrypoint.sh")
      fs.writeFileSync(probePath, source)

      // A `node` that reports what it was handed, in the argv and in the environment.
      const binDir = path.join(workDir, "bin")
      fs.mkdirSync(binDir)
      fs.writeFileSync(
        path.join(binDir, "node"),
        '#!/bin/sh\necho "ARGV:$*"\necho "ENV_UI:${AX_CODE_DESKTOP_UI_PASSWORD:-<unset>}"\n',
        { mode: 0o755 },
      )

      const result = spawnSync("sh", [probePath], {
        env: { ...process.env, UI_PASSWORD: "hunter2", PATH: `${binDir}:${process.env.PATH}` },
        encoding: "utf8",
      })
      const output = `${result.stdout}${result.stderr}`

      expect(output).toMatch(/ARGV:.*serve --foreground/)
      expect(output).not.toContain("--ui-password")
      expect(output).toContain("ENV_UI:hunter2")
    } finally {
      fs.rmSync(workDir, { recursive: true, force: true })
    }
  })
})
