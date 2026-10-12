import { spawnSync } from "node:child_process"
import { mkdtemp, mkdir, writeFile, chmod, readFile, readdir, rm } from "node:fs/promises"
import os from "node:os"
import path from "node:path"
import { describe, expect, test } from "vitest"

const installer = path.resolve(import.meta.dirname, "../desktop/scripts/install.sh")

async function fixture(mode) {
  const root = await mkdtemp(path.join(os.tmpdir(), "native-desktop-entry-test-"))
  const bin = path.join(root, "bin")
  await mkdir(bin)
  const curl = path.join(bin, "curl")
  await writeFile(
    curl,
    `#!/bin/bash
printf '%s\\n' "$@" > "$AX_TEST_ROOT/curl-args"
while [[ "$#" -gt 0 ]]; do
  if [[ "$1" == -o ]]; then output="$2"; break; fi
  shift
done
case "$AX_TEST_MODE" in
  missing) printf 'touch "$AX_TEST_ROOT/unexpected"\\n' > "$output"; exit 22 ;;
  empty) : > "$output" ;;
  success|failed-install)
    printf 'printf "%%s\\n" "$@" > "$AX_TEST_ROOT/arguments"\\nexit %s\\n' "$AX_TEST_EXIT" > "$output" ;;
esac
`,
  )
  await chmod(curl, 0o755)
  for (const command of ["npm", "pnpm", "yarn", "node"]) {
    const file = path.join(bin, command)
    await writeFile(file, '#!/bin/bash\ntouch "$AX_TEST_ROOT/unexpected"\nexit 99\n')
    await chmod(file, 0o755)
  }
  const result = spawnSync("bash", [installer, "argument with spaces", "--version", "7.24.5"], {
    encoding: "utf8",
    timeout: 10_000,
    env: {
      ...process.env,
      PATH: `${bin}:/usr/bin:/bin`,
      TMPDIR: root,
      AX_TEST_ROOT: root,
      AX_TEST_MODE: mode,
      AX_TEST_EXIT: mode === "failed-install" ? "7" : "0",
    },
  })
  try {
    expect(result.error).toBeUndefined()
    expect(await readdir(root)).not.toContain("unexpected")
    expect((await readdir(root)).filter((name) => name.startsWith("ax-code-desktop-entry."))).toEqual([])
    return {
      ...result,
      curlArgs: await readFile(path.join(root, "curl-args"), "utf8"),
      arguments: await readFile(path.join(root, "arguments"), "utf8").catch(() => undefined),
    }
  } finally {
    await rm(root, { recursive: true, force: true })
  }
}

describe("native Desktop bootstrap entry", () => {
  test.each(["missing", "empty"])("does not execute a %s download or install a Web package", async (mode) => {
    const result = await fixture(mode)
    expect(result.status).toBe(1)
    expect(result.stderr).toContain("nothing was installed")
    expect(result.arguments).toBeUndefined()
  })

  test("uses the HTTPS Desktop namespace and preserves installer arguments", async () => {
    const result = await fixture("success")
    expect(result.status, result.stderr).toBe(0)
    expect(result.curlArgs).toContain("https://download.automatosx.com/ax-code-desktop/install\n")
    expect(result.curlArgs).toContain("--proto\n=https\n--proto-redir\n=https\n")
    expect(result.arguments).toBe("argument with spaces\n--version\n7.24.5\n")
  })

  test("preserves failure from the verified native installer", async () => {
    expect((await fixture("failed-install")).status).toBe(7)
  })
})
