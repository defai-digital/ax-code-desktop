import fs from "node:fs"
import os from "node:os"
import path from "node:path"
import { expect, test } from "vitest"
import { createRequire } from "node:module"
import { finished } from "node:stream/promises"
import { spawnSync } from "node:child_process"
import {
  readInstalledVersion,
  assertHostedRunner,
  digest,
  verifyPreserved,
  writeSyntheticIfAbsent,
  capturePreservedFile,
  qualificationVersion,
  prepareCanonicalAuthFixture,
} from "./native-installer-qualification.mjs"

test.each(["stable", "missing-provider", "rewritten"])(
  "canonical credential fixture rejects unsafe runtime reads: %s",
  (behavior) => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), "desktop-canonical-auth-"))
    const auth = path.join(root, "auth.json")
    const references = path.join(root, "references.json")
    let reads = 0
    try {
      fs.writeFileSync(auth, "synthetic plaintext", { mode: 0o600 })
      const prepare = () =>
        prepareCanonicalAuthFixture(root, auth, references, {
          run: () => {
            reads++
            if (reads === 1 || behavior === "rewritten") fs.writeFileSync(auth, `synthetic canonical ${reads}`)
            fs.writeFileSync(
              references,
              JSON.stringify({
                providers:
                  behavior === "missing-provider" ? {} : { qualification: { type: "summary", summary: "api" } },
              }),
            )
          },
        })
      if (behavior === "stable") {
        const record = prepare()
        expect(reads).toBe(2)
        expect(record.sha256).toBe(digest(auth))
        expect(() => verifyPreserved([record])).not.toThrow()
      } else {
        expect(prepare).toThrow(behavior === "missing-provider" ? /not readable/ : /changed profile/)
      }
    } finally {
      fs.rmSync(root, { recursive: true, force: true })
    }
  },
)

test("refuses native installation on developer or self-hosted machines", () => {
  expect(() => assertHostedRunner({}, `${process.platform}-${process.arch}`)).toThrow(/disposable/)
  expect(() =>
    assertHostedRunner(
      { GITHUB_ACTIONS: "true", RUNNER_ENVIRONMENT: "self-hosted" },
      `${process.platform}-${process.arch}`,
    ),
  ).toThrow(/Self-hosted/)
})

test("resolves the candidate version independently of the caller working directory", () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "desktop-decoy-version-"))
  try {
    fs.writeFileSync(path.join(root, "package.json"), '{"version":"0.0.1"}')
    const module = new URL("./native-installer-qualification.mjs", import.meta.url).href
    const result = spawnSync(
      process.execPath,
      [
        "--input-type=module",
        "-e",
        `import {qualificationVersion} from ${JSON.stringify(module)}; process.stdout.write(qualificationVersion())`,
      ],
      { cwd: root, encoding: "utf8" },
    )
    expect(result.status).toBe(0)
    expect(result.stdout).toBe(qualificationVersion())
    expect(result.stdout).not.toBe("0.0.1")
  } finally {
    fs.rmSync(root, { recursive: true, force: true })
  }
})

test.skipIf(process.platform === "win32")(
  "rejects permission weakening and symlink replacement of preserved credentials",
  () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), "desktop-continuity-permissions-"))
    const file = path.join(root, "auth.json")
    try {
      fs.writeFileSync(file, "synthetic", { mode: 0o600 })
      const records = [capturePreservedFile(file)]
      fs.chmodSync(file, 0o644)
      expect(() => verifyPreserved(records)).toThrow(/mode/)
      fs.chmodSync(file, 0o600)
      expect(() => verifyPreserved(records)).not.toThrow()
      const target = path.join(root, "replacement.json")
      fs.renameSync(file, target)
      fs.symlinkSync(target, file)
      expect(() => verifyPreserved(records)).toThrow(/replaced/)
    } finally {
      fs.rmSync(root, { recursive: true, force: true })
    }
  },
)
test("detects credential/profile alteration or removal rather than claiming continuity", () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "desktop-continuity-test-"))
  const file = path.join(root, "auth.json")
  try {
    fs.writeFileSync(file, "synthetic-original")
    const records = [{ file, sha256: digest(file) }]
    expect(() => verifyPreserved(records)).not.toThrow()
    fs.writeFileSync(file, "synthetic-replacement")
    expect(() => verifyPreserved(records)).toThrow(/changed profile/)
    fs.unlinkSync(file)
    expect(() => verifyPreserved(records)).toThrow()
  } finally {
    fs.rmSync(root, { recursive: true, force: true })
  }
})
test("writes a missing qualification file and leaves an existing file unchanged", () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "desktop-synthetic-file-"))
  const file = path.join(root, "auth.json")
  try {
    writeSyntheticIfAbsent(file, "synthetic-first")
    expect(fs.readFileSync(file, "utf8")).toBe("synthetic-first")
    writeSyntheticIfAbsent(file, "synthetic-second")
    expect(fs.readFileSync(file, "utf8")).toBe("synthetic-first")
  } finally {
    fs.rmSync(root, { recursive: true, force: true })
  }
})

test("reads replaced installer archives without retaining the previous ASAR header", async () => {
  const require = createRequire(new URL("../desktop/packages/electron/package.json", import.meta.url))
  const asar = require("@electron/asar")
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "desktop-replaced-asar-"))
  const archive = path.join(root, "app.asar")
  try {
    for (const [version, size] of [
      ["7.24.5", 1024],
      ["7.10.2", 2048],
      ["7.24.5", 1024],
    ]) {
      const source = path.join(root, `source-${size}`)
      fs.mkdirSync(source, { recursive: true })
      fs.writeFileSync(path.join(source, "aaa.bin"), Buffer.alloc(size))
      fs.writeFileSync(path.join(source, "package.json"), JSON.stringify({ version }))
      await finished(await asar.createPackage(source, archive))
      expect(readInstalledVersion(archive)).toBe(version)
    }
  } finally {
    asar.uncache(archive)
    fs.rmSync(root, { recursive: true, force: true })
  }
})
