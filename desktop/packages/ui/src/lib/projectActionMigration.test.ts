// @vitest-environment node
import { execFileSync } from "node:child_process"
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { expect, test } from "vitest"
import { migrateLegacyProjectAction } from "./projectActionMigration"
import { commandInProjectDirectory } from "./projectActionPreview"

const command = "python -m streamlit run 'app.py'"
test("unknown and invalid recipes preserve the stored command without acquiring execution semantics", () => {
  for (const metadata of [
    undefined,
    [],
    { version: 2, entrypoint: "app.py" },
    { version: 1, entrypoint: "../app.py" },
    { version: 1, entrypoint: "app.py", interpreter: "python\nother" },
    { version: 1, entrypoint: "app.py", port: 0 },
  ]) {
    expect(migrateLegacyProjectAction(command, metadata)).toEqual({ command })
  }
  expect(migrateLegacyProjectAction("my custom command", { version: 1, entrypoint: "app.py", port: 9001 })).toEqual({
    command: "my custom command",
  })
})

test.each(["/bin/sh", "/bin/bash", "/bin/zsh"].filter(existsSync))(
  "legacy interpreter and entrypoint stay literal in %s",
  (shell) => {
    const root = mkdtempSync(join(tmpdir(), "ax-action-migration-"))
    const dir = join(root, "project ' ; $(touch INJECTED)")
    mkdirSync(dir)
    try {
      const interpreter = join(dir, "python ' ; $(touch INJECTED)")
      const entrypoint = "folder/app ' ; $(touch INJECTED) 雪.py"
      writeFileSync(interpreter, '#!/bin/sh\nprintf "%s\\0" "$@" > "$AX_ARGV_OUTPUT"\n', { mode: 0o700 })
      const original = `python -m streamlit run '${entrypoint.replaceAll("'", "'\\''")}'`
      const migrated = migrateLegacyProjectAction(original, { version: 1, entrypoint, interpreter, port: 9007 })
      execFileSync(shell, ["-c", commandInProjectDirectory(migrated.command, dir)], {
        cwd: root,
        env: { ...process.env, AX_ARGV_OUTPUT: join(dir, "argv") },
      })
      expect(readFileSync(join(dir, "argv"), "utf8").split("\0").slice(0, -1)).toEqual([
        "-m",
        "streamlit",
        "run",
        entrypoint,
        "--server.address=127.0.0.1",
        "--server.headless=true",
        "--server.port=9007",
      ])
      expect(existsSync(join(dir, "INJECTED"))).toBe(false)
      expect(existsSync(join(root, "INJECTED"))).toBe(false)
      expect(migrated.openUrl).toBe("http://127.0.0.1:9007/")
      expect(migrateLegacyProjectAction(migrated.command, undefined)).toEqual({ command: migrated.command })
    } finally {
      rmSync(root, { recursive: true, force: true })
    }
  },
)

test("retains the retired recipe's supported relative-path spelling", () => {
  const original = "python -m streamlit run './app.py'"
  const migrated = migrateLegacyProjectAction(original, {
    version: 1,
    entrypoint: "./app.py",
    interpreter: "python3.12",
    port: 9080,
  })
  expect(migrated.command).toContain("'python3.12'")
  expect(migrated.command).toContain("'./app.py'")
  expect(migrated.openUrl).toBe("http://127.0.0.1:9080/")
})
